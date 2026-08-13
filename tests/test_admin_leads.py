"""Admin review of landing-page vendor sign-ups (leads): list, verify (which
creates the vendor + a Stripe checkout session, mirroring POST /admin/vendors),
and reject. Same boot pattern as test_leads.py."""
from __future__ import annotations

import fakeredis.aioredis
import pytest
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

from app.core.security import create_access_token
from app.main import create_app
from app.repositories.catalog import PlanRepository
from app.repositories.identity import AdminRepository

VALID_LEAD = {
    "name": "Asha Rao",
    "organisation": "Rao Multispecialty Hospital",
    "segment": "hospital",
    "phone": "+91 98765 43210",
    "email": "asha@raohospital.example",
}


class _FakeStripeClient:
    """Stands in for app.services.stripe_client.StripeClient - only the one
    method StripeService.create_checkout_session calls."""

    async def create_checkout_session(self, **kwargs):
        return {"url": "https://checkout.example/test", "id": "cs_test_123"}


@pytest.fixture
def client(monkeypatch):
    db = AsyncMongoMockClient()["qly_admin_leads_test"]
    redis = fakeredis.aioredis.FakeRedis(decode_responses=True)

    import app.db.mongo as mongo_module
    import app.db.redis_client as redis_module

    monkeypatch.setattr(mongo_module, "get_database", lambda: db)
    monkeypatch.setattr(redis_module, "get_redis", lambda: redis)

    async def noop():
        return None

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

    import app.api.deps as deps_module

    monkeypatch.setattr(deps_module, "get_database", lambda: db)

    import app.api.v1.routes.admin as admin_routes

    monkeypatch.setattr(admin_routes, "get_stripe_client", lambda: _FakeStripeClient())

    with TestClient(create_app()) as test_client:
        test_client.db = db
        yield test_client


def _files(name="cert.pdf", content=b"%PDF-1.4 fake certificate", content_type="application/pdf"):
    return {"registration_certificate": (name, content, content_type)}


async def _seed_plan(db, code="growth"):
    await PlanRepository(db).create(
        {
            "code": code,
            "name": "Growth",
            "monthly_price": 49,
            "yearly_price": 490,
            "is_trial": False,
            "archived": False,
        }
    )


async def _seed_admin(db, role="super_admin", email="root@qly.test"):
    return await AdminRepository(db).create(
        {"email": email, "name": "Test Admin", "role": role, "status": "active"}
    )


def _headers(admin):
    token = create_access_token(subject=admin["id"], principal_type="admin", role=admin["role"])
    return {"Authorization": f"Bearer {token}"}


def _submit_lead(client):
    response = client.post("/api/v1/leads", data=VALID_LEAD, files=_files())
    assert response.status_code == 201
    return response.json()["data"]["id"]


VERIFY_PAYLOAD = {
    "company_name": "Rao Multispecialty Hospital",
    "owner_name": "Asha Rao",
    "email": "asha@raohospital.example",
    "plan_code": "growth",
}


async def test_list_leads_requires_permission(client):
    admin = await _seed_admin(client.db, role="marketing")  # no admin_leads permission
    response = client.get("/api/v1/admin/leads", headers=_headers(admin))
    assert response.status_code == 403


async def test_list_leads(client):
    admin = await _seed_admin(client.db)
    lead_id = _submit_lead(client)

    response = client.get("/api/v1/admin/leads", headers=_headers(admin))
    assert response.status_code == 200
    rows = response.json()["data"]
    assert len(rows) == 1
    assert rows[0]["id"] == lead_id
    assert rows[0]["status"] == "pending"


async def test_verify_lead_creates_vendor_and_marks_lead(client):
    admin = await _seed_admin(client.db)
    await _seed_plan(client.db)
    lead_id = _submit_lead(client)

    response = client.post(
        f"/api/v1/admin/leads/{lead_id}/verify", headers=_headers(admin), json=VERIFY_PAYLOAD
    )
    assert response.status_code == 201
    body = response.json()["data"]
    assert body["checkout_url"] == "https://checkout.example/test"
    assert body["status"] == "pending"  # the freshly created tenant
    assert body["lead_id"] == lead_id

    vendors = client.get("/api/v1/admin/vendors", headers=_headers(admin)).json()["data"]
    assert any(v["company_name"] == "Rao Multispecialty Hospital" for v in vendors)

    leads = client.get("/api/v1/admin/leads", headers=_headers(admin)).json()["data"]
    assert leads[0]["status"] == "verified"
    assert leads[0]["tenant_id"] == body["id"]


async def test_verify_already_processed_lead_conflicts(client):
    admin = await _seed_admin(client.db)
    await _seed_plan(client.db)
    lead_id = _submit_lead(client)

    first = client.post(
        f"/api/v1/admin/leads/{lead_id}/verify", headers=_headers(admin), json=VERIFY_PAYLOAD
    )
    assert first.status_code == 201

    second = client.post(
        f"/api/v1/admin/leads/{lead_id}/verify", headers=_headers(admin), json=VERIFY_PAYLOAD
    )
    assert second.status_code == 409


async def test_reject_lead(client):
    admin = await _seed_admin(client.db)
    lead_id = _submit_lead(client)

    response = client.post(f"/api/v1/admin/leads/{lead_id}/reject", headers=_headers(admin))
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "rejected"

    again = client.post(f"/api/v1/admin/leads/{lead_id}/reject", headers=_headers(admin))
    assert again.status_code == 409


async def test_sales_role_can_verify_and_reject(client):
    admin = await _seed_admin(client.db, role="sales", email="sales@qly.test")
    await _seed_plan(client.db)
    lead_id = _submit_lead(client)

    response = client.post(
        f"/api/v1/admin/leads/{lead_id}/verify", headers=_headers(admin), json=VERIFY_PAYLOAD
    )
    assert response.status_code == 201


async def test_certificate_download(client):
    admin = await _seed_admin(client.db)
    lead_id = _submit_lead(client)

    response = client.get(f"/api/v1/admin/leads/{lead_id}/certificate", headers=_headers(admin))
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content == b"%PDF-1.4 fake certificate"
