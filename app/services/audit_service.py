"""Audit logging. Append-only: this service exposes no update or delete."""
from __future__ import annotations

from typing import Any, Dict, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.repositories.catalog import AuditRepository
from app.schemas.common import PaginationParams


class AuditService:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.repo = AuditRepository(db)

    async def record(
        self,
        *,
        actor_id: Optional[str],
        action: str,
        module: str,
        tenant_id: Optional[str] = None,
        actor_email: Optional[str] = None,
        resource_id: Optional[str] = None,
        previous_value: Optional[Dict[str, Any]] = None,
        updated_value: Optional[Dict[str, Any]] = None,
        ip: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        await self.repo.record(
            {
                "tenant_id": tenant_id,
                "actor_id": actor_id,
                "actor_email": actor_email,
                "action": action,
                "module": module,
                "resource_id": resource_id,
                "previous_value": previous_value,
                "updated_value": updated_value,
                "ip_address": ip,
                "user_agent": user_agent,
            }
        )

    async def list(
        self, params: PaginationParams, tenant_id: Optional[str] = None
    ) -> tuple[list, int]:
        filters = {"tenant_id": tenant_id} if tenant_id else {}
        return await self.repo.list(params, filters=filters)
