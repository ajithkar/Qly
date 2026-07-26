"""Repositories for the vendor catalog: branches, providers, services,
appointments, plans and audit logs."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from app.core.security import utcnow
from app.models.base import serialize, to_object_id, touch
from app.models.enums import AppointmentStatus
from app.repositories.base import BaseRepository


class BranchRepository(BaseRepository):
    collection_name = "branches"
    searchable_fields = ("name",)

    async def find_near(
        self, longitude: float, latitude: float, radius_metres: int, limit: int = 20
    ) -> List[dict]:
        """Geo discovery for the public 'near me' vendor search."""
        cursor = self.collection.find(
            {
                "is_deleted": False,
                "location": {
                    "$nearSphere": {
                        "$geometry": {
                            "type": "Point",
                            "coordinates": [longitude, latitude],
                        },
                        "$maxDistance": radius_metres,
                    }
                },
            }
        ).limit(limit)
        return [serialize(d) for d in await cursor.to_list(length=limit)]


class ProviderRepository(BaseRepository):
    collection_name = "providers"
    searchable_fields = ("name", "specialty", "title")

    async def list_for_branch(self, tenant_id: str, branch_id: str) -> List[dict]:
        cursor = self.collection.find(
            {"tenant_id": tenant_id, "branch_id": branch_id, "is_deleted": False}
        )
        return [serialize(d) for d in await cursor.to_list(length=500)]


class ServiceRepository(BaseRepository):
    collection_name = "services"
    searchable_fields = ("name", "description")

    async def list_for_branch(self, tenant_id: str, branch_id: str) -> List[dict]:
        cursor = self.collection.find(
            {"tenant_id": tenant_id, "branch_id": branch_id, "is_deleted": False}
        )
        return [serialize(d) for d in await cursor.to_list(length=500)]


class AppointmentRepository(BaseRepository):
    collection_name = "appointments"
    searchable_fields = ("customer_name", "customer_phone")

    ACTIVE_STATUSES = [
        AppointmentStatus.BOOKED.value,
        AppointmentStatus.CONFIRMED.value,
        AppointmentStatus.CHECKED_IN.value,
    ]

    async def booked_between(
        self,
        tenant_id: str,
        provider_id: str,
        start: datetime,
        end: datetime,
    ) -> List[dict]:
        cursor = self.collection.find(
            {
                "tenant_id": tenant_id,
                "provider_id": provider_id,
                "status": {"$in": self.ACTIVE_STATUSES},
                "slot_start": {"$gte": start, "$lt": end},
            }
        )
        return [serialize(d) for d in await cursor.to_list(length=500)]

    async def guarded_status_change(
        self,
        appointment_id: str,
        tenant_id: str,
        *,
        expected: List[str],
        target: str,
        extra_set: Optional[Dict[str, Any]] = None,
        actor_id: Optional[str] = None,
    ) -> Optional[dict]:
        doc = await self.collection.find_one_and_update(
            {
                "_id": to_object_id(appointment_id),
                "tenant_id": tenant_id,
                "status": {"$in": expected},
            },
            {"$set": {"status": target, **(extra_set or {}), **touch(actor_id)}},
            return_document=True,
        )
        return serialize(doc)


class PlanRepository(BaseRepository):
    collection_name = "plans"
    tenant_scoped = False
    searchable_fields = ("name", "code")

    async def get_by_code(self, code: str) -> Optional[dict]:
        return serialize(await self.collection.find_one({"code": code, "archived": False}))


class SubscriptionRepository(BaseRepository):
    collection_name = "subscriptions"
    tenant_scoped = False
    soft_delete = False

    async def get_for_tenant(self, tenant_id: str) -> Optional[dict]:
        return serialize(await self.collection.find_one({"tenant_id": tenant_id}))


class AuditRepository(BaseRepository):
    """Append-only. There is deliberately no update or delete method here -
    immutability is enforced by the absence of a write path, not by convention."""

    collection_name = "audit_logs"
    tenant_scoped = False
    soft_delete = False
    searchable_fields = ("action", "module", "actor_email")

    async def record(self, entry: Dict[str, Any]) -> None:
        await self.collection.insert_one({**entry, "created_at": utcnow()})
