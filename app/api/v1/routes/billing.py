"""Vendor billing endpoints and the Stripe webhook receiver."""
from __future__ import annotations

import json
import os
from typing import Any, Dict

from fastapi import APIRouter, Depends, Header, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.deps import get_current_staff, get_db, get_tenant_id, require_permission
from app.core.errors import ValidationError
from app.core.logging import get_logger
from app.core.permissions import Action, VendorModule
from app.schemas.billing import CheckoutRequest
from app.schemas.common import ok
from app.services.stripe_service import StripeService, WebhookVerificationError

logger = get_logger(__name__)
router = APIRouter(tags=["billing"])


@router.get("/vendor/subscription")
async def get_subscription(
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(VendorModule.BILLING.value, Action.VIEW)),
) -> Dict[str, Any]:
    return ok(await StripeService(db).subscription_for(tenant_id))


@router.post("/vendor/checkout")
async def create_checkout(
    payload: CheckoutRequest,
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(VendorModule.BILLING.value, Action.UPDATE)),
) -> Dict[str, Any]:
    """Returns a Checkout URL. Landing on the success page does NOT activate
    anything - only the webhook does."""
    return ok(
        await StripeService(db).create_checkout_session(
            tenant_id, payload.plan_code, payload.billing_cycle
        )
    )


@router.post("/vendor/cancel")
async def cancel_subscription(
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(VendorModule.BILLING.value, Action.UPDATE)),
) -> Dict[str, Any]:
    return ok(await StripeService(db).cancel_subscription(tenant_id))


@router.post("/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(default="", alias="Stripe-Signature"),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """The single source of truth for subscription state.

    Reads the RAW body - re-serialising the parsed JSON would change the bytes
    and break signature verification.
    """
    raw_body = await request.body()
    secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("stripe_webhook_secret_missing")
        raise WebhookVerificationError("Webhook secret is not configured.")

    StripeService.verify_signature(raw_body, stripe_signature, secret)

    try:
        event = json.loads(raw_body)
    except ValueError:
        raise ValidationError("Webhook body is not valid JSON.")

    return ok(await StripeService(db).handle_webhook(event))
