"""Thin async wrapper around the real Stripe SDK.

Stripe's Python SDK is synchronous; every call is dispatched to a thread via
`asyncio.to_thread` so it never blocks the event loop. `StripeService` only
ever calls the methods below - it never imports `stripe` directly, so the
signature-verification and activation logic stays testable with a mock.
"""
from __future__ import annotations

import asyncio
from typing import Any, Dict, Optional

import stripe

from app.core.config import settings


class StripeClient:
    def __init__(self) -> None:
        stripe.api_key = settings.STRIPE_SECRET_KEY

    async def create_checkout_session(
        self,
        *,
        tenant_id: str,
        plan_code: str,
        billing_cycle: str,
        amount: float,
        currency: str,
    ) -> Dict[str, Any]:
        def _create() -> Any:
            return stripe.checkout.Session.create(
                mode="subscription",
                payment_method_types=["card"],
                line_items=[
                    {
                        "price_data": {
                            "currency": currency.lower(),
                            "product_data": {
                                "name": f"Qly {plan_code.title()} plan ({billing_cycle})"
                            },
                            "unit_amount": int(round(amount * 100)),
                            "recurring": {
                                "interval": "year" if billing_cycle == "yearly" else "month"
                            },
                        },
                        "quantity": 1,
                    }
                ],
                metadata={
                    "tenant_id": tenant_id,
                    "plan_code": plan_code,
                    "billing_cycle": billing_cycle,
                },
                success_url=f"{settings.STRIPE_SUCCESS_URL}?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=settings.STRIPE_CANCEL_URL,
            )

        session = await asyncio.to_thread(_create)
        return {"id": session["id"], "url": session["url"]}

    async def cancel_subscription(self, subscription_id: str) -> None:
        await asyncio.to_thread(
            stripe.Subscription.modify, subscription_id, cancel_at_period_end=True
        )


_singleton: Optional[StripeClient] = None


def get_stripe_client() -> Optional[StripeClient]:
    """None when Stripe isn't configured - callers fall back to a 503,
    same as before this module existed."""
    global _singleton
    if not settings.STRIPE_SECRET_KEY:
        return None
    if _singleton is None:
        _singleton = StripeClient()
    return _singleton
