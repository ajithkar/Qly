"""Index creation, run once at application startup.

Indexes here are load-bearing, not just performance tuning:
  * appointments unique (tenant, branch, provider, slot_start) is what makes
    double-booking impossible under concurrency.
  * queue_counters unique key is what makes atomic token allocation correct.
  * stripe_events.event_id unique is what makes webhook handling idempotent.
"""
from __future__ import annotations

from pymongo import ASCENDING, DESCENDING, GEOSPHERE, IndexModel

from app.core.logging import get_logger
from app.db.mongo import get_database

logger = get_logger(__name__)

INDEXES: dict[str, list[IndexModel]] = {
    "tenants": [
        IndexModel([("slug", ASCENDING)], unique=True),
        IndexModel([("owner_email", ASCENDING)], unique=True),
        IndexModel([("status", ASCENDING)]),
    ],
    "users": [
        IndexModel([("email", ASCENDING)], unique=True),
        IndexModel([("google_sub", ASCENDING)], unique=True, sparse=True),
        IndexModel([("status", ASCENDING)]),
    ],
    "staff": [
        IndexModel([("tenant_id", ASCENDING), ("email", ASCENDING)], unique=True),
        IndexModel([("tenant_id", ASCENDING), ("role", ASCENDING)]),
        IndexModel([("invite_token_hash", ASCENDING)], sparse=True),
    ],
    "admins": [
        IndexModel([("email", ASCENDING)], unique=True),
    ],
    "refresh_tokens": [
        IndexModel([("token_hash", ASCENDING)], unique=True),
        IndexModel([("subject", ASCENDING), ("family", ASCENDING)]),
        IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=0),
    ],
    "branches": [
        IndexModel([("tenant_id", ASCENDING), ("is_deleted", ASCENDING)]),
        IndexModel([("location", GEOSPHERE)], sparse=True),
    ],
    "providers": [
        IndexModel([("tenant_id", ASCENDING), ("branch_id", ASCENDING), ("is_deleted", ASCENDING)]),
        IndexModel([("tenant_id", ASCENDING), ("status", ASCENDING)]),
    ],
    "services": [
        IndexModel([("tenant_id", ASCENDING), ("branch_id", ASCENDING), ("is_deleted", ASCENDING)]),
        IndexModel([("tenant_id", ASCENDING), ("name", ASCENDING)]),
    ],
    "appointments": [
        # Load-bearing: prevents two clients booking the same provider slot.
        IndexModel(
            [
                ("tenant_id", ASCENDING),
                ("branch_id", ASCENDING),
                ("provider_id", ASCENDING),
                ("slot_start", ASCENDING),
            ],
            unique=True,
            partialFilterExpression={"status": {"$in": ["booked", "confirmed", "checked_in"]}},
            name="uniq_active_slot",
        ),
        IndexModel([("tenant_id", ASCENDING), ("business_day", DESCENDING)]),
        IndexModel([("user_id", ASCENDING), ("slot_start", DESCENDING)]),
        IndexModel([("tenant_id", ASCENDING), ("status", ASCENDING)]),
    ],
    "queues": [
        IndexModel([("tenant_id", ASCENDING), ("branch_id", ASCENDING), ("status", ASCENDING)]),
        IndexModel([("tenant_id", ASCENDING), ("service_id", ASCENDING)]),
    ],
    "queue_tokens": [
        IndexModel([("queue_id", ASCENDING), ("status", ASCENDING), ("position", ASCENDING)]),
        IndexModel([("tenant_id", ASCENDING), ("business_day", DESCENDING)]),
        IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)]),
        IndexModel([("queue_id", ASCENDING), ("token_number", ASCENDING)], unique=True),
    ],
    "queue_counters": [
        IndexModel(
            [
                ("tenant_id", ASCENDING),
                ("branch_id", ASCENDING),
                ("service_id", ASCENDING),
                ("business_day", ASCENDING),
            ],
            unique=True,
            name="uniq_counter_key",
        ),
    ],
    "service_durations": [
        IndexModel([("tenant_id", ASCENDING), ("provider_id", ASCENDING), ("service_id", ASCENDING)]),
        IndexModel([("completed_at", DESCENDING)]),
    ],
    "customers": [
        IndexModel([("tenant_id", ASCENDING), ("user_id", ASCENDING)], unique=True),
        IndexModel([("tenant_id", ASCENDING), ("blacklisted", ASCENDING)]),
    ],
    "plans": [
        IndexModel([("code", ASCENDING)], unique=True),
        IndexModel([("archived", ASCENDING)]),
    ],
    "subscriptions": [
        IndexModel([("tenant_id", ASCENDING)], unique=True),
        IndexModel([("stripe_subscription_id", ASCENDING)], sparse=True),
    ],
    "stripe_events": [
        IndexModel([("event_id", ASCENDING)], unique=True),
        IndexModel([("processed", ASCENDING), ("created_at", DESCENDING)]),
    ],
    "notifications": [
        IndexModel([("recipient_id", ASCENDING), ("created_at", DESCENDING)]),
        IndexModel([("recipient_id", ASCENDING), ("read", ASCENDING)]),
    ],
    "audit_logs": [
        IndexModel([("tenant_id", ASCENDING), ("created_at", DESCENDING)]),
        IndexModel([("actor_id", ASCENDING), ("created_at", DESCENDING)]),
        IndexModel([("module", ASCENDING), ("action", ASCENDING)]),
    ],
    "consents": [
        IndexModel([("subject_id", ASCENDING), ("document", ASCENDING), ("version", ASCENDING)]),
    ],
    "leads": [
        IndexModel([("created_at", DESCENDING)]),
        IndexModel([("segment", ASCENDING), ("created_at", DESCENDING)]),
    ],
}


async def ensure_indexes() -> None:
    db = get_database()
    for collection, models in INDEXES.items():
        if models:
            await db[collection].create_indexes(models)
    logger.info("indexes_ensured", extra={"collections": len(INDEXES)})
