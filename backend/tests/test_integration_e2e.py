"""End-to-end smoke test of the flow the frontend actually performs.

This is the test that was missing. The contract checker proves every frontend
call maps to a real route; this proves those routes work *in sequence*, with
real auth, real permission guards and real tenant scoping — the sign-in, then
setup, then serve-a-customer path that a demo walks through.

It boots the real FastAPI app with in-memory Mongo and Redis doubles, so it
runs in CI with no services attached. Where a behaviour genuinely depends on
the real MongoDB server (unique-index enforcement), that is called out rather
than quietly assumed.
"""
from __future__ import annotations

import fakeredis.aioredis
import pytest
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

from app.core.security import hash_password, utcnow
from app.main import create_app

VENDOR_EMAIL = "owner@demo-clinic.com"
VENDOR_PASSWORD = "DemoPassw0rd"


@pytest.fixture
def client(monkeypatch):
    """The real app, wired to in-memory datastores.

    Note: seed through the async collection API, never through
    `collection.delegate`. In mongomock-motor the sync delegate writes to a
    different store than async reads see, so delegate-seeded fixtures produce
    an app that cannot find its own data.
    """
    db = AsyncMongoMockClient()["qly_e2e"]
    redis = fakeredis.aioredis.FakeRedis(decode_responses=True)

    import app.db.mongo as mongo_module
    import app.db.redis_client as redis_module

    monkeypatch.setattr(mongo_module, "get_database", lambda: db)
    monkeypatch.setattr(redis_module, "get_redis", lambda: redis)

    async def noop():
        return None

    # Skip real connection setup; the doubles are already in place.
    monkeypatch.setattr(mongo_module, "connect_to_mongo", noop)
    monkeypatch.setattr(mongo_module, "close_mongo_connection", noop)
    monkeypatch.setattr(redis_module, "connect_to_redis", noop)
    monkeypatch.setattr(redis_module, "close_redis_connection", noop)

    import app.main as main_module

    monkeypatch.setattr(main_module, "connect_to_mongo", noop)
    monkeypatch.setattr(main_module, "close_mongo_connection", noop)
    monkeypatch.setattr(main_module, "connect_to_redis", noop)
    monkeypatch.setattr(main_module, "close_redis_connection", noop)
    monkeypatch.setattr(main_module, "ensure_indexes", noop)

    # get_db is resolved through the deps module at request time.
    import app.api.deps as deps_module

    monkeypatch.setattr(deps_module, "get_database", lambda: db)

    with TestClient(create_app()) as test_client:
        test_client.db = db
        yield test_client


@pytest.fixture
async def signed_in(client):
    """A verified, active vendor owner — the state a demo starts from."""
    tenant = await client.db["tenants"].insert_one(
        {
            "company_name": "Demo Clinic",
            "slug": "demo-clinic",
            "owner_email": VENDOR_EMAIL,
            "status": "active",
            "plan_code": "business",
            "timezone": "UTC",
            "currency": "USD",
            "is_deleted": False,
            "created_at": utcnow(),
            "updated_at": utcnow(),
        }
    )
    tenant_id = str(tenant.inserted_id)

    await client.db["staff"].insert_one(
        {
            "tenant_id": tenant_id,
            "email": VENDOR_EMAIL,
            "name": "Demo Owner",
            "password_hash": hash_password(VENDOR_PASSWORD),
            "role": "owner",
            "custom_permissions": [],
            "status": "active",
            "email_verified": True,
            "is_deleted": False,
            "created_at": utcnow(),
            "updated_at": utcnow(),
        }
    )
    await client.db["plans"].insert_one(
        {
            "code": "business",
            "name": "Business",
            "monthly_price": 99,
            "yearly_price": 990,
            "max_branches": 10,
            "max_providers": 50,
            "max_services": 100,
            "archived": False,
            "is_deleted": False,
        }
    )

    response = client.post(
        "/api/v1/auth/login",
        json={"email": VENDOR_EMAIL, "password": VENDOR_PASSWORD},
    )
    assert response.status_code == 200, response.text
    token = response.json()["data"]["access_token"]
    return {
        "headers": {"Authorization": f"Bearer {token}"},
        "tenant_id": tenant_id,
    }


# ---------------------------------------------------------------- envelope
def test_health_is_reachable(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_errors_use_the_envelope_the_frontend_parses(client):
    """`apiError` in the frontend expects exactly this shape."""
    response = client.get("/api/v1/vendor/queues")
    assert response.status_code == 401
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}


def test_success_uses_the_data_envelope(client, signed_in):
    response = client.get("/api/v1/vendor/branches", headers=signed_in["headers"])
    assert response.status_code == 200
    body = response.json()
    # requestPage() in the frontend requires both keys with these exact names.
    assert "data" in body and "meta" in body
    assert set(body["meta"]) == {"page", "page_size", "total", "total_pages"}


def test_auth_me_returns_permissions_for_the_ui_guards(client, signed_in):
    response = client.get("/api/v1/auth/me", headers=signed_in["headers"])
    assert response.status_code == 200
    principal = response.json()["data"]
    assert principal["principal_type"] == "staff"
    assert principal["tenant_id"] == signed_in["tenant_id"]
    # VendorLayout filters navigation on exactly these strings.
    for permission in ("dashboard:view", "queues:view", "queues:update", "billing:view"):
        assert permission in principal["permissions"]


# ------------------------------------------------------ the full demo path
def test_setup_then_serve_a_customer(client, signed_in):
    """Branch -> service -> provider -> queue -> start -> token -> call -> complete."""
    headers = signed_in["headers"]

    branch = client.post(
        "/api/v1/vendor/branches",
        headers=headers,
        json={"name": "Main Branch", "timezone": "UTC"},
    )
    assert branch.status_code == 201, branch.text
    branch_id = branch.json()["data"]["id"]

    service = client.post(
        "/api/v1/vendor/services",
        headers=headers,
        json={
            "name": "General Consultation",
            "branch_id": branch_id,
            "duration_minutes": 10,
            "price": 0,
            "payment_mode": "pay_at_venue",
            "token_prefix": "A",
        },
    )
    assert service.status_code == 201, service.text
    service_id = service.json()["data"]["id"]

    provider = client.post(
        "/api/v1/vendor/providers",
        headers=headers,
        json={
            "name": "Alex Fry",
            "branch_id": branch_id,
            "consultation_fee": 0,
            "working_hours": [
                {
                    "weekday": day,
                    "opens_at": "09:00:00",
                    "closes_at": "17:00:00",
                    "is_closed": False,
                }
                for day in range(7)
            ],
        },
    )
    assert provider.status_code == 201, provider.text
    provider_id = provider.json()["data"]["id"]

    queue = client.post(
        "/api/v1/vendor/queues",
        headers=headers,
        json={
            "name": "Walk-ins",
            "branch_id": branch_id,
            "service_id": service_id,
            "provider_id": provider_id,
        },
    )
    assert queue.status_code == 201, queue.text
    queue_id = queue.json()["data"]["id"]
    assert queue.json()["data"]["status"] == "draft"

    # A queue must be started before it accepts anyone.
    rejected = client.post(
        f"/api/v1/vendor/queues/{queue_id}/tokens/walk-in",
        headers=headers,
        json={"customer_name": "Too early"},
    )
    assert rejected.status_code == 409
    assert rejected.json()["error"]["code"] == "queue_not_open"

    started = client.post(f"/api/v1/vendor/queues/{queue_id}/start", headers=headers)
    assert started.status_code == 200, started.text
    assert started.json()["data"]["status"] == "open"

    numbers = []
    for name in ("Ada", "Grace", "Alan"):
        issued = client.post(
            f"/api/v1/vendor/queues/{queue_id}/tokens/walk-in",
            headers=headers,
            json={"customer_name": name},
        )
        assert issued.status_code == 201, issued.text
        numbers.append(issued.json()["data"]["token_number"])

    # The service prefix drives numbering, which the call board renders as-is.
    assert numbers == ["A001", "A002", "A003"]

    monitor = client.get(
        f"/api/v1/vendor/queues/{queue_id}/monitor", headers=headers
    ).json()["data"]
    assert monitor["waiting_count"] == 3
    assert monitor["current_token"] is None
    assert monitor["next_token"]["token_number"] == "A001"
    # ETA falls back to the configured duration until real timings accumulate.
    assert monitor["estimated_wait_minutes"] == 30.0

    called = client.post(f"/api/v1/vendor/queues/{queue_id}/call-next", headers=headers)
    assert called.status_code == 200, called.text
    token = called.json()["data"]
    assert token["token_number"] == "A001"
    assert token["status"] == "called"

    completed = client.post(
        f"/api/v1/vendor/queues/tokens/{token['id']}/complete", headers=headers
    )
    assert completed.status_code == 200, completed.text
    assert completed.json()["data"]["status"] == "completed"

    after = client.get(
        f"/api/v1/vendor/queues/{queue_id}/monitor", headers=headers
    ).json()["data"]
    assert after["waiting_count"] == 2
    assert after["completed_count"] == 1


def test_second_operator_gets_a_clean_conflict(client, signed_in):
    """Two desks, one token. The loser must get 409, not a double-serve."""
    headers = signed_in["headers"]

    branch_id = client.post(
        "/api/v1/vendor/branches", headers=headers,
        json={"name": "Branch One", "timezone": "UTC"},
    ).json()["data"]["id"]
    service_id = client.post(
        "/api/v1/vendor/services", headers=headers,
        json={"name": "Standard Service", "branch_id": branch_id, "duration_minutes": 5},
    ).json()["data"]["id"]
    queue_id = client.post(
        "/api/v1/vendor/queues", headers=headers,
        json={"name": "Main Queue", "branch_id": branch_id, "service_id": service_id},
    ).json()["data"]["id"]
    client.post(f"/api/v1/vendor/queues/{queue_id}/start", headers=headers)
    client.post(
        f"/api/v1/vendor/queues/{queue_id}/tokens/walk-in",
        headers=headers, json={"customer_name": "Only one"},
    )

    token = client.post(
        f"/api/v1/vendor/queues/{queue_id}/call-next", headers=headers
    ).json()["data"]
    client.post(f"/api/v1/vendor/queues/tokens/{token['id']}/complete", headers=headers)

    # The second desk acts on a token that is already finished.
    second = client.post(
        f"/api/v1/vendor/queues/tokens/{token['id']}/complete", headers=headers
    )
    assert second.status_code == 409
    # The console keys its "another operator got there first" message off this.
    assert second.json()["error"]["code"] in ("invalid_transition", "concurrent_update")


def test_calling_an_empty_queue_is_a_clean_404(client, signed_in):
    headers = signed_in["headers"]
    branch_id = client.post(
        "/api/v1/vendor/branches", headers=headers,
        json={"name": "Branch One", "timezone": "UTC"},
    ).json()["data"]["id"]
    service_id = client.post(
        "/api/v1/vendor/services", headers=headers,
        json={"name": "Standard Service", "branch_id": branch_id, "duration_minutes": 5},
    ).json()["data"]["id"]
    queue_id = client.post(
        "/api/v1/vendor/queues", headers=headers,
        json={"name": "Main Queue", "branch_id": branch_id, "service_id": service_id},
    ).json()["data"]["id"]
    client.post(f"/api/v1/vendor/queues/{queue_id}/start", headers=headers)

    response = client.post(f"/api/v1/vendor/queues/{queue_id}/call-next", headers=headers)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "queue_empty"


def test_edit_and_delete_a_queue(client, signed_in):
    """The Queues dashboard's Edit and Delete actions, end to end."""
    headers = signed_in["headers"]
    branch_id = client.post(
        "/api/v1/vendor/branches", headers=headers,
        json={"name": "Branch One", "timezone": "UTC"},
    ).json()["data"]["id"]
    service_id = client.post(
        "/api/v1/vendor/services", headers=headers,
        json={"name": "Standard Service", "branch_id": branch_id, "duration_minutes": 5},
    ).json()["data"]["id"]
    queue_id = client.post(
        "/api/v1/vendor/queues", headers=headers,
        json={"name": "Main Queue", "branch_id": branch_id, "service_id": service_id},
    ).json()["data"]["id"]

    renamed = client.patch(
        f"/api/v1/vendor/queues/{queue_id}", headers=headers,
        json={"name": "Renamed Queue", "max_tokens": 50},
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["data"]["name"] == "Renamed Queue"
    assert renamed.json()["data"]["max_tokens"] == 50

    # A queue still serving customers cannot be deleted out from under them.
    client.post(f"/api/v1/vendor/queues/{queue_id}/start", headers=headers)
    blocked = client.delete(f"/api/v1/vendor/queues/{queue_id}", headers=headers)
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "queue_still_active"

    client.post(f"/api/v1/vendor/queues/{queue_id}/close", headers=headers)
    deleted = client.delete(f"/api/v1/vendor/queues/{queue_id}", headers=headers)
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["data"]["deleted"] is True

    # Soft-deleted queues drop out of both the list and direct lookup.
    missing = client.get(f"/api/v1/vendor/queues/{queue_id}", headers=headers)
    assert missing.status_code == 404
    listed = client.get("/api/v1/vendor/queues", headers=headers).json()
    assert queue_id not in [q["id"] for q in listed["data"]]

    again = client.delete(f"/api/v1/vendor/queues/{queue_id}", headers=headers)
    assert again.status_code == 404


async def test_receptionist_cannot_delete_a_queue(client, signed_in):
    """Only owner/manager get queues:delete - a receptionist gets a clean 403."""
    headers = signed_in["headers"]
    branch_id = client.post(
        "/api/v1/vendor/branches", headers=headers,
        json={"name": "Branch One", "timezone": "UTC"},
    ).json()["data"]["id"]
    service_id = client.post(
        "/api/v1/vendor/services", headers=headers,
        json={"name": "Standard Service", "branch_id": branch_id, "duration_minutes": 5},
    ).json()["data"]["id"]
    queue_id = client.post(
        "/api/v1/vendor/queues", headers=headers,
        json={"name": "Main Queue", "branch_id": branch_id, "service_id": service_id},
    ).json()["data"]["id"]

    await client.db["staff"].insert_one(
        {
            "tenant_id": signed_in["tenant_id"],
            "email": "desk@demo-clinic.com", "name": "Front Desk",
            "password_hash": hash_password(VENDOR_PASSWORD),
            "role": "receptionist", "custom_permissions": [],
            "status": "active", "email_verified": True, "is_deleted": False,
        }
    )
    receptionist_token = client.post(
        "/api/v1/auth/login",
        json={"email": "desk@demo-clinic.com", "password": VENDOR_PASSWORD},
    ).json()["data"]["access_token"]
    receptionist_headers = {"Authorization": f"Bearer {receptionist_token}"}

    blocked = client.delete(f"/api/v1/vendor/queues/{queue_id}", headers=receptionist_headers)
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "permission_denied"

    # But editing is within their role.
    edited = client.patch(
        f"/api/v1/vendor/queues/{queue_id}", headers=receptionist_headers,
        json={"name": "Front Desk Renamed"},
    )
    assert edited.status_code == 200, edited.text


# ------------------------------------------------------------ isolation
async def test_another_tenant_cannot_read_your_queues(client, signed_in):
    """Tenant scope comes from the token, so a forged id changes nothing."""
    headers = signed_in["headers"]
    branch_id = client.post(
        "/api/v1/vendor/branches", headers=headers,
        json={"name": "Private", "timezone": "UTC"},
    ).json()["data"]["id"]

    intruder_tenant = await client.db["tenants"].insert_one(
        {
            "company_name": "Other Co", "slug": "other-co",
            "owner_email": "other@rival-co.com", "status": "active",
            "plan_code": "business", "is_deleted": False,
        }
    )
    await client.db["staff"].insert_one(
        {
            "tenant_id": str(intruder_tenant.inserted_id),
            "email": "other@rival-co.com", "name": "Other Owner",
            "password_hash": hash_password(VENDOR_PASSWORD),
            "role": "owner", "custom_permissions": [], "status": "active",
            "email_verified": True, "is_deleted": False,
        }
    )
    intruder_token = client.post(
        "/api/v1/auth/login",
        json={"email": "other@rival-co.com", "password": VENDOR_PASSWORD},
    ).json()["data"]["access_token"]

    response = client.get(
        f"/api/v1/vendor/branches/{branch_id}",
        headers={"Authorization": f"Bearer {intruder_token}"},
    )
    # The branch exists, but not for this caller.
    assert response.status_code in (404, 405)

    listed = client.get(
        "/api/v1/vendor/branches",
        headers={"Authorization": f"Bearer {intruder_token}"},
    ).json()
    assert listed["meta"]["total"] == 0


async def test_permission_guard_blocks_a_receptionist_from_billing(client, signed_in):
    """UI hides Billing for a receptionist; the API must refuse it regardless."""
    await client.db["staff"].insert_one(
        {
            "tenant_id": signed_in["tenant_id"],
            "email": "desk@demo-clinic.com", "name": "Front Desk",
            "password_hash": hash_password(VENDOR_PASSWORD),
            "role": "receptionist", "custom_permissions": [],
            "status": "active", "email_verified": True, "is_deleted": False,
        }
    )
    token = client.post(
        "/api/v1/auth/login",
        json={"email": "desk@demo-clinic.com", "password": VENDOR_PASSWORD},
    ).json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    principal = client.get("/api/v1/auth/me", headers=headers).json()["data"]
    assert "billing:view" not in principal["permissions"]
    assert "queues:update" in principal["permissions"]

    blocked = client.get("/api/v1/vendor/subscription", headers=headers)
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "permission_denied"
