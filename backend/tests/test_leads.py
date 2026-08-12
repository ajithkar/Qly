"""POST /leads — the public demo-request / trial-signup form on the
marketing site. Fully unauthenticated, boots the real app against in-memory
Mongo/Redis doubles, same pattern as test_integration_e2e.py."""
from __future__ import annotations

import fakeredis.aioredis
import pytest
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

from app.main import create_app

VALID_LEAD = {
    "name": "Asha Rao",
    "organisation": "Rao Multispecialty Hospital",
    "segment": "hospital",
    "phone": "+91 98765 43210",
    "email": "asha@raohospital.example",
    "department_count": "6-15",
    "branch_count": "2-5",
}


@pytest.fixture
def client(monkeypatch):
    db = AsyncMongoMockClient()["qly_leads_test"]
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

    with TestClient(create_app()) as test_client:
        test_client.db = db
        yield test_client


def _files(name="cert.pdf", content=b"%PDF-1.4 fake certificate", content_type="application/pdf"):
    return {"registration_certificate": (name, content, content_type)}


def test_create_lead_success(client):
    response = client.post("/api/v1/leads", data=VALID_LEAD, files=_files())
    assert response.status_code == 201
    body = response.json()["data"]
    assert body["id"]
    assert "team will reach out" in body["message"]


def test_create_lead_rejects_bad_email(client):
    response = client.post(
        "/api/v1/leads", data={**VALID_LEAD, "email": "not-an-email"}, files=_files()
    )
    assert response.status_code == 422


def test_create_lead_rejects_unknown_segment(client):
    response = client.post(
        "/api/v1/leads", data={**VALID_LEAD, "segment": "bank"}, files=_files()
    )
    assert response.status_code == 422


def test_create_lead_requires_certificate(client):
    response = client.post("/api/v1/leads", data=VALID_LEAD)
    assert response.status_code == 422


def test_create_lead_rejects_unsupported_certificate_type(client):
    response = client.post(
        "/api/v1/leads",
        data=VALID_LEAD,
        files=_files(name="cert.txt", content=b"not a real cert", content_type="text/plain"),
    )
    assert response.status_code == 422


def test_create_lead_rejects_oversized_certificate(client, monkeypatch):
    import app.services.file_storage as file_storage_module

    monkeypatch.setattr(file_storage_module.settings, "LEAD_UPLOAD_MAX_MB", 0)
    response = client.post("/api/v1/leads", data=VALID_LEAD, files=_files(content=b"x" * 1024))
    assert response.status_code == 422


def test_create_lead_accepts_jpg_certificate(client):
    response = client.post(
        "/api/v1/leads",
        data=VALID_LEAD,
        files=_files(name="cert.jpg", content=b"\xff\xd8\xff fake jpeg", content_type="image/jpeg"),
    )
    assert response.status_code == 201
