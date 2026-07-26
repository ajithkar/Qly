"""Test fixtures. Uses mongomock-motor so the suite runs without a live
MongoDB; concurrency semantics that depend on the real server are called out
explicitly in the tests that cover them."""
from __future__ import annotations

import pytest
from mongomock_motor import AsyncMongoMockClient

from app.repositories.catalog import ProviderRepository, ServiceRepository, BranchRepository
from app.repositories.queues import CounterRepository, QueueRepository, TokenRepository


@pytest.fixture
def db():
    return AsyncMongoMockClient()["qly_test"]


@pytest.fixture
def tenant_id() -> str:
    return "64b7f9c2e1a3d4b5c6a7e8f9"


@pytest.fixture
async def seeded(db, tenant_id):
    """A branch, a service and an open queue ready for token issuing."""
    branch = await BranchRepository(db).create(
        {"name": "Main Branch", "timezone": "UTC", "holidays": []}, tenant_id, "actor"
    )
    service = await ServiceRepository(db).create(
        {
            "name": "General Consultation",
            "branch_id": branch["id"],
            "duration_minutes": 10,
            "buffer_minutes": 0,
            "price": 0,
            "payment_mode": "pay_at_venue",
            "queue_capacity": 50,
            "token_prefix": "A",
            "provider_ids": [],
        },
        tenant_id,
        "actor",
    )
    provider = await ProviderRepository(db).create(
        {
            "name": "Provider One",
            "branch_id": branch["id"],
            "consultation_fee": 0,
            "status": "active",
            "working_hours": [
                {"weekday": d, "opens_at": "09:00:00", "closes_at": "17:00:00", "is_closed": False}
                for d in range(7)
            ],
            "leaves": [],
        },
        tenant_id,
        "actor",
    )
    queue = await QueueRepository(db).create(
        {
            "name": "Walk-in",
            "branch_id": branch["id"],
            "service_id": service["id"],
            "provider_id": provider["id"],
            "max_tokens": 50,
            "status": "open",
            "business_day": "2026-07-22",
        },
        tenant_id,
        "actor",
    )
    return {
        "branch": branch,
        "service": service,
        "provider": provider,
        "queue": queue,
    }
