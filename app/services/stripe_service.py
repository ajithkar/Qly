"""Stripe billing.

The governing rule: **the Checkout success page is UX only.** A subscription
becomes active because a signature-verified webhook said so, never because the
browser landed on a success URL. A user can forge a redirect; they cannot forge
a signed webhook.

Every webhook is recorded in `stripe_events` keyed by Stripe's event id with a
unique index, so a redelivery is a no-op rather than a double-activation.
"""
from __future__ import annotations

import hashlib
import hmac
import time
from typing import Any, Dict, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.core.config import settings
from app.core.errors import AppError, Conflict, NotFound, ValidationError
from app.core.logging import get_logger
from app.core.security import utcnow
from app.models.base import to_object_id
from app.models.enums import TenantStatus
from app.repositories.catalog import PlanRepository, SubscriptionRepository
from app.repositories.identity import TenantRepository

logger = get_logger(__name__)


class WebhookVerificationError(AppError):
    status_code = 400
    code = "webhook_signature_invalid"
    message = "Webhook signature verification failed."


class StripeService:
    """Billing lifecycle.

    Network calls to Stripe live behind `_client`, which is injected in tests.
    Nothing in this class trusts client-supplied state.
    """

    # Grace window before a past-due subscription suspends the tenant.
    DUNNING_GRACE_DAYS = 7

    def __init__(self, db: AsyncIOMotorDatabase, client: Optional[Any] = None) -> None:
        self.db = db
        self.tenants = TenantRepository(db)
        self.plans = PlanRepository(db)
        self.subscriptions = SubscriptionRepository(db)
        self._client = client

    # ------------------------------------------------------------------
    # Signature verification
    # ------------------------------------------------------------------
    @staticmethod
    def verify_signature(
        payload: bytes, signature_header: str, secret: str, tolerance_seconds: int = 300
    ) -> Dict[str, str]:
        """Verify Stripe's `Stripe-Signature` header.

        Implemented directly so the rule is auditable rather than hidden in a
        vendor SDK: parse t= and v1=, recompute HMAC-SHA256 over "t.payload",
        compare in constant time, and reject stale timestamps to block replay.
        """
        if not signature_header:
            raise WebhookVerificationError("Missing Stripe-Signature header.")

        parts: Dict[str, str] = {}
        for chunk in signature_header.split(","):
            if "=" in chunk:
                key, _, value = chunk.partition("=")
                parts.setdefault(key.strip(), value.strip())

        timestamp = parts.get("t")
        provided = parts.get("v1")
        if not timestamp or not provided:
            raise WebhookVerificationError("Malformed Stripe-Signature header.")

        try:
            age = abs(time.time() - int(timestamp))
        except ValueError:
            raise WebhookVerificationError("Invalid signature timestamp.")
        if age > tolerance_seconds:
            raise WebhookVerificationError("Webhook timestamp is outside the tolerance window.")

        signed_payload = f"{timestamp}.".encode() + payload
        expected = hmac.new(
            secret.encode(), signed_payload, hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(expected, provided):
            raise WebhookVerificationError()
        return parts

    # ------------------------------------------------------------------
    # Checkout
    # ------------------------------------------------------------------
    async def create_checkout_session(
        self, tenant_id: str, plan_code: str, billing_cycle: str = "monthly"
    ) -> Dict[str, Any]:
        tenant = await self.tenants.get_by_id(tenant_id)
        if not tenant:
            raise NotFound("Organisation not found.")
        plan = await self.plans.get_by_code(plan_code)
        if not plan:
            raise NotFound("Plan not found.")
        if billing_cycle not in ("monthly", "yearly"):
            raise ValidationError("Billing cycle must be 'monthly' or 'yearly'.")

        if self._client is None:
            raise AppError(
                "Stripe is not configured on this environment.",
                code="stripe_not_configured",
                status_code=503,
            )

        session = await self._client.create_checkout_session(
            tenant_id=tenant_id,
            plan_code=plan_code,
            billing_cycle=billing_cycle,
            amount=plan["yearly_price"] if billing_cycle == "yearly" else plan["monthly_price"],
            currency=tenant.get("currency", "USD"),
        )
        # Deliberately NOT activating anything here.
        logger.info(
            "checkout_session_created",
            extra={"tenant_id": tenant_id, "plan_code": plan_code},
        )
        return {"checkout_url": session["url"], "session_id": session["id"]}

    # ------------------------------------------------------------------
    # Webhook processing
    # ------------------------------------------------------------------
    async def handle_webhook(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """Process a verified Stripe event exactly once."""
        event_id = event.get("id")
        event_type = event.get("type", "")
        if not event_id:
            raise ValidationError("Event is missing an id.")

        # Idempotency, belt and braces:
        #   1. a pre-check catches the ordinary redelivery case, and
        #   2. the unique index on event_id catches the race where two
        #      deliveries arrive concurrently and both pass the pre-check.
        already = await self.db["stripe_events"].find_one({"event_id": event_id})
        if already is not None:
            logger.info("stripe_event_duplicate_ignored", extra={"event_id": event_id})
            return {"status": "duplicate_ignored", "event_id": event_id}

        try:
            await self.db["stripe_events"].insert_one(
                {
                    "event_id": event_id,
                    "type": event_type,
                    "payload": event,
                    "processed": False,
                    "attempts": 0,
                    "created_at": utcnow(),
                }
            )
        except DuplicateKeyError:
            logger.info("stripe_event_duplicate_ignored", extra={"event_id": event_id})
            return {"status": "duplicate_ignored", "event_id": event_id}

        handlers = {
            "checkout.session.completed": self._on_checkout_completed,
            "customer.subscription.created": self._on_subscription_updated,
            "customer.subscription.updated": self._on_subscription_updated,
            "customer.subscription.deleted": self._on_subscription_deleted,
            "invoice.paid": self._on_invoice_paid,
            "invoice.payment_failed": self._on_payment_failed,
        }
        handler = handlers.get(event_type)

        try:
            result = await handler(event) if handler else {"handler": "none"}
        except Exception as exc:  # noqa: BLE001
            await self.db["stripe_events"].update_one(
                {"event_id": event_id},
                {"$set": {"processed": False, "error": str(exc)}, "$inc": {"attempts": 1}},
            )
            logger.exception("stripe_event_failed", extra={"event_id": event_id})
            raise

        await self.db["stripe_events"].update_one(
            {"event_id": event_id},
            {"$set": {"processed": True, "processed_at": utcnow()}, "$inc": {"attempts": 1}},
        )
        # Note the ordering: the handler's own keys are merged first so a
        # handler can never overwrite the outer "status" field.
        return {**result, "status": "processed", "event_id": event_id}

    async def _on_checkout_completed(self, event: Dict[str, Any]) -> Dict[str, Any]:
        obj = event["data"]["object"]
        metadata = obj.get("metadata") or {}
        tenant_id = metadata.get("tenant_id")
        plan_code = metadata.get("plan_code")
        if not tenant_id or not plan_code:
            raise ValidationError("Checkout session is missing tenant metadata.")

        await self._activate(
            tenant_id=tenant_id,
            plan_code=plan_code,
            stripe_customer_id=obj.get("customer"),
            stripe_subscription_id=obj.get("subscription"),
            billing_cycle=metadata.get("billing_cycle", "monthly"),
        )
        return {"tenant_id": tenant_id, "activated": True}

    async def _on_subscription_updated(self, event: Dict[str, Any]) -> Dict[str, Any]:
        obj = event["data"]["object"]
        subscription = await self.subscriptions.find_one(
            {"stripe_subscription_id": obj.get("id")}
        )
        if not subscription:
            return {"status": "unknown_subscription"}

        stripe_status = obj.get("status", "active")
        await self.subscriptions.collection.update_one(
            {"stripe_subscription_id": obj.get("id")},
            {
                "$set": {
                    "stripe_status": stripe_status,
                    "current_period_end": obj.get("current_period_end"),
                    "cancel_at_period_end": obj.get("cancel_at_period_end", False),
                    "updated_at": utcnow(),
                }
            },
        )
        # Only an explicitly healthy status keeps the tenant active.
        tenant_status = (
            TenantStatus.ACTIVE.value
            if stripe_status in ("active", "trialing")
            else TenantStatus.SUSPENDED.value
        )
        await self.tenants.update(
            subscription["tenant_id"], {"status": tenant_status}
        )
        return {"tenant_id": subscription["tenant_id"], "status": stripe_status}

    async def _on_subscription_deleted(self, event: Dict[str, Any]) -> Dict[str, Any]:
        obj = event["data"]["object"]
        subscription = await self.subscriptions.find_one(
            {"stripe_subscription_id": obj.get("id")}
        )
        if not subscription:
            return {"status": "unknown_subscription"}
        await self.subscriptions.collection.update_one(
            {"stripe_subscription_id": obj.get("id")},
            {"$set": {"stripe_status": "canceled", "cancelled_at": utcnow()}},
        )
        await self.tenants.update(
            subscription["tenant_id"], {"status": TenantStatus.CANCELLED.value}
        )
        return {"tenant_id": subscription["tenant_id"], "cancelled": True}

    async def _on_invoice_paid(self, event: Dict[str, Any]) -> Dict[str, Any]:
        obj = event["data"]["object"]
        await self.db["invoices"].update_one(
            {"stripe_invoice_id": obj.get("id")},
            {
                "$set": {
                    "stripe_invoice_id": obj.get("id"),
                    "stripe_customer_id": obj.get("customer"),
                    "amount_paid": obj.get("amount_paid", 0),
                    "currency": obj.get("currency", "usd"),
                    "status": "paid",
                    "hosted_invoice_url": obj.get("hosted_invoice_url"),
                    "paid_at": utcnow(),
                }
            },
            upsert=True,
        )
        subscription = await self.subscriptions.find_one(
            {"stripe_customer_id": obj.get("customer")}
        )
        if subscription:
            # A successful payment clears any dunning state.
            await self.subscriptions.collection.update_one(
                {"_id": to_object_id(subscription["id"])},
                {"$set": {"past_due_since": None, "stripe_status": "active"}},
            )
            await self.tenants.update(
                subscription["tenant_id"], {"status": TenantStatus.ACTIVE.value}
            )
        return {"invoice": obj.get("id"), "paid": True}

    async def _on_payment_failed(self, event: Dict[str, Any]) -> Dict[str, Any]:
        obj = event["data"]["object"]
        subscription = await self.subscriptions.find_one(
            {"stripe_customer_id": obj.get("customer")}
        )
        if not subscription:
            return {"status": "unknown_customer"}
        # Enter dunning rather than suspending immediately - a failed card is
        # usually recoverable, and cutting service instantly loses customers.
        await self.subscriptions.collection.update_one(
            {"stripe_customer_id": obj.get("customer")},
            {
                "$set": {
                    "stripe_status": "past_due",
                    "past_due_since": utcnow(),
                    "updated_at": utcnow(),
                }
            },
        )
        return {"tenant_id": subscription["tenant_id"], "past_due": True}

    # ------------------------------------------------------------------
    async def _activate(
        self,
        *,
        tenant_id: str,
        plan_code: str,
        stripe_customer_id: Optional[str],
        stripe_subscription_id: Optional[str],
        billing_cycle: str,
    ) -> None:
        await self.subscriptions.collection.update_one(
            {"tenant_id": tenant_id},
            {
                "$set": {
                    "tenant_id": tenant_id,
                    "plan_code": plan_code,
                    "billing_cycle": billing_cycle,
                    "stripe_customer_id": stripe_customer_id,
                    "stripe_subscription_id": stripe_subscription_id,
                    "stripe_status": "active",
                    "past_due_since": None,
                    "activated_at": utcnow(),
                    "updated_at": utcnow(),
                },
                "$setOnInsert": {"created_at": utcnow()},
            },
            upsert=True,
        )
        await self.tenants.update(
            tenant_id, {"status": TenantStatus.ACTIVE.value, "plan_code": plan_code}
        )
        logger.info(
            "subscription_activated",
            extra={"tenant_id": tenant_id, "plan_code": plan_code},
        )

    # ------------------------------------------------------------------
    async def subscription_for(self, tenant_id: str) -> Dict[str, Any]:
        subscription = await self.subscriptions.get_for_tenant(tenant_id)
        tenant = await self.tenants.get_by_id(tenant_id)
        plan_code = (subscription or {}).get("plan_code") or (tenant or {}).get("plan_code")
        plan = await self.plans.get_by_code(plan_code) if plan_code else None
        return {
            "subscription": subscription,
            "plan": plan,
            "tenant_status": (tenant or {}).get("status"),
        }

    async def cancel_subscription(self, tenant_id: str) -> Dict[str, Any]:
        subscription = await self.subscriptions.get_for_tenant(tenant_id)
        if not subscription:
            raise NotFound("No active subscription found.")
        if self._client is not None and subscription.get("stripe_subscription_id"):
            await self._client.cancel_subscription(subscription["stripe_subscription_id"])
        # The tenant is not downgraded here - the webhook will confirm.
        await self.subscriptions.collection.update_one(
            {"tenant_id": tenant_id},
            {"$set": {"cancel_at_period_end": True, "updated_at": utcnow()}},
        )
        return {"cancellation_requested": True}
