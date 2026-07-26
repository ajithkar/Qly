"""Stripe webhook verification, idempotency, and the activation rule."""
import hashlib
import hmac
import json
import time

import pytest

from app.core.errors import ValidationError
from app.models.enums import TenantStatus
from app.services.stripe_service import StripeService, WebhookVerificationError

SECRET = "whsec_test_secret"


def _sign(payload: bytes, secret: str = SECRET, timestamp: int | None = None) -> str:
    ts = timestamp or int(time.time())
    signature = hmac.new(
        secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256
    ).hexdigest()
    return f"t={ts},v1={signature}"


# ---------------------------------------------------- signature verification
def test_valid_signature_accepted():
    payload = json.dumps({"id": "evt_1"}).encode()
    StripeService.verify_signature(payload, _sign(payload), SECRET)


def test_wrong_secret_rejected():
    payload = json.dumps({"id": "evt_1"}).encode()
    with pytest.raises(WebhookVerificationError):
        StripeService.verify_signature(payload, _sign(payload, "whsec_wrong"), SECRET)


def test_tampered_payload_rejected():
    payload = json.dumps({"id": "evt_1", "amount": 100}).encode()
    header = _sign(payload)
    tampered = json.dumps({"id": "evt_1", "amount": 999999}).encode()
    with pytest.raises(WebhookVerificationError):
        StripeService.verify_signature(tampered, header, SECRET)


def test_replayed_old_signature_rejected():
    """An attacker who captures a valid webhook cannot replay it later."""
    payload = json.dumps({"id": "evt_1"}).encode()
    stale = _sign(payload, timestamp=int(time.time()) - 3600)
    with pytest.raises(WebhookVerificationError):
        StripeService.verify_signature(payload, stale, SECRET)


def test_missing_header_rejected():
    with pytest.raises(WebhookVerificationError):
        StripeService.verify_signature(b"{}", "", SECRET)


def test_malformed_header_rejected():
    with pytest.raises(WebhookVerificationError):
        StripeService.verify_signature(b"{}", "garbage", SECRET)


# --------------------------------------------------------------- activation
@pytest.fixture
async def billing_setup(db, tenant_id):
    await db["plans"].insert_one(
        {
            "code": "business",
            "name": "Business",
            "monthly_price": 99,
            "yearly_price": 990,
            "max_branches": 10,
            "archived": False,
            "is_deleted": False,
        }
    )
    await db["tenants"].insert_one(
        {
            "_id": __import__("bson").ObjectId(tenant_id),
            "company_name": "Test Org",
            "slug": "test-org",
            "owner_email": "owner@test.local",
            "status": TenantStatus.PENDING.value,
            "plan_code": "free",
            "is_deleted": False,
        }
    )
    return {"plan_code": "business"}


def _checkout_event(tenant_id: str, event_id: str = "evt_checkout_1") -> dict:
    return {
        "id": event_id,
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_1",
                "customer": "cus_test_1",
                "subscription": "sub_test_1",
                "metadata": {
                    "tenant_id": tenant_id,
                    "plan_code": "business",
                    "billing_cycle": "monthly",
                },
            }
        },
    }


async def test_webhook_activates_subscription(db, tenant_id, billing_setup):
    service = StripeService(db)
    result = await service.handle_webhook(_checkout_event(tenant_id))
    assert result["status"] == "processed"

    tenant = await db["tenants"].find_one({"slug": "test-org"})
    assert tenant["status"] == TenantStatus.ACTIVE.value
    assert tenant["plan_code"] == "business"

    subscription = await db["subscriptions"].find_one({"tenant_id": tenant_id})
    assert subscription["stripe_status"] == "active"
    assert subscription["stripe_subscription_id"] == "sub_test_1"


async def test_duplicate_webhook_is_ignored(db, tenant_id, billing_setup):
    """Stripe retries deliveries; processing twice must not double-charge or
    double-activate."""
    service = StripeService(db)
    first = await service.handle_webhook(_checkout_event(tenant_id))
    second = await service.handle_webhook(_checkout_event(tenant_id))

    assert first["status"] == "processed"
    assert second["status"] == "duplicate_ignored"
    assert await db["stripe_events"].count_documents({"event_id": "evt_checkout_1"}) == 1


async def test_event_without_tenant_metadata_is_rejected(db, tenant_id, billing_setup):
    bad = _checkout_event(tenant_id, "evt_bad")
    bad["data"]["object"]["metadata"] = {}
    with pytest.raises(ValidationError):
        await StripeService(db).handle_webhook(bad)


async def test_payment_failure_enters_dunning_not_instant_suspension(
    db, tenant_id, billing_setup
):
    service = StripeService(db)
    await service.handle_webhook(_checkout_event(tenant_id))

    await service.handle_webhook(
        {
            "id": "evt_failed_1",
            "type": "invoice.payment_failed",
            "data": {"object": {"id": "in_1", "customer": "cus_test_1"}},
        }
    )
    subscription = await db["subscriptions"].find_one({"tenant_id": tenant_id})
    assert subscription["stripe_status"] == "past_due"
    assert subscription["past_due_since"] is not None

    # The tenant is NOT suspended yet - dunning grace applies first.
    tenant = await db["tenants"].find_one({"slug": "test-org"})
    assert tenant["status"] == TenantStatus.ACTIVE.value


async def test_successful_payment_clears_dunning(db, tenant_id, billing_setup):
    service = StripeService(db)
    await service.handle_webhook(_checkout_event(tenant_id))
    await service.handle_webhook(
        {
            "id": "evt_failed_2",
            "type": "invoice.payment_failed",
            "data": {"object": {"id": "in_2", "customer": "cus_test_1"}},
        }
    )
    await service.handle_webhook(
        {
            "id": "evt_paid_1",
            "type": "invoice.paid",
            "data": {
                "object": {
                    "id": "in_3",
                    "customer": "cus_test_1",
                    "amount_paid": 9900,
                    "currency": "usd",
                }
            },
        }
    )
    subscription = await db["subscriptions"].find_one({"tenant_id": tenant_id})
    assert subscription["stripe_status"] == "active"
    assert subscription["past_due_since"] is None


async def test_subscription_deleted_cancels_tenant(db, tenant_id, billing_setup):
    service = StripeService(db)
    await service.handle_webhook(_checkout_event(tenant_id))
    await service.handle_webhook(
        {
            "id": "evt_del_1",
            "type": "customer.subscription.deleted",
            "data": {"object": {"id": "sub_test_1"}},
        }
    )
    tenant = await db["tenants"].find_one({"slug": "test-org"})
    assert tenant["status"] == TenantStatus.CANCELLED.value


async def test_unknown_event_type_is_ignored_safely(db, tenant_id, billing_setup):
    result = await StripeService(db).handle_webhook(
        {"id": "evt_unknown", "type": "some.future.event", "data": {"object": {}}}
    )
    assert result["status"] == "processed"
