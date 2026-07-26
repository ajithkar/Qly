"""Base repository.

Repositories are the only layer that talks to MongoDB. Services must never
build queries themselves. Tenant scoping is applied here so it cannot be
forgotten at a call site.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from motor.motor_asyncio import AsyncIOMotorCollection, AsyncIOMotorDatabase

from app.models.base import new_audit, serialize, to_object_id, touch
from app.schemas.common import PaginationParams


class BaseRepository:
    collection_name: str = ""
    tenant_scoped: bool = True
    soft_delete: bool = True
    searchable_fields: Sequence[str] = ()

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.db = db

    @property
    def collection(self) -> AsyncIOMotorCollection:
        return self.db[self.collection_name]

    # -- query building --------------------------------------------------
    def _scope(self, tenant_id: Optional[str], extra: Optional[Dict] = None) -> Dict[str, Any]:
        query: Dict[str, Any] = dict(extra or {})
        if self.tenant_scoped:
            if not tenant_id:
                raise ValueError(
                    f"{self.collection_name} is tenant-scoped; a tenant_id is required."
                )
            query["tenant_id"] = tenant_id
        if self.soft_delete:
            query.setdefault("is_deleted", False)
        return query

    def _search(self, query: Dict[str, Any], term: Optional[str]) -> Dict[str, Any]:
        if term and self.searchable_fields:
            query["$or"] = [
                {field: {"$regex": term, "$options": "i"}}
                for field in self.searchable_fields
            ]
        return query

    # -- reads -----------------------------------------------------------
    async def get_by_id(
        self, doc_id: str, tenant_id: Optional[str] = None
    ) -> Optional[dict]:
        query = self._scope(tenant_id, {"_id": to_object_id(doc_id)})
        return serialize(await self.collection.find_one(query))

    async def find_one(
        self, filters: Dict[str, Any], tenant_id: Optional[str] = None
    ) -> Optional[dict]:
        return serialize(await self.collection.find_one(self._scope(tenant_id, filters)))

    async def list(
        self,
        params: PaginationParams,
        tenant_id: Optional[str] = None,
        filters: Optional[Dict[str, Any]] = None,
    ) -> tuple[List[dict], int]:
        query = self._search(self._scope(tenant_id, filters), params.search)
        total = await self.collection.count_documents(query)
        cursor = (
            self.collection.find(query)
            .sort(params.sort, params.sort_direction)
            .skip(params.skip)
            .limit(params.page_size)
        )
        items = [serialize(doc) for doc in await cursor.to_list(length=params.page_size)]
        return items, total

    async def count(
        self, tenant_id: Optional[str] = None, filters: Optional[Dict[str, Any]] = None
    ) -> int:
        return await self.collection.count_documents(self._scope(tenant_id, filters))

    # -- writes ----------------------------------------------------------
    async def create(
        self,
        payload: Dict[str, Any],
        tenant_id: Optional[str] = None,
        actor_id: Optional[str] = None,
    ) -> dict:
        doc = {**payload, **new_audit(actor_id)}
        if self.tenant_scoped and tenant_id:
            doc["tenant_id"] = tenant_id
        result = await self.collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return serialize(doc)

    async def update(
        self,
        doc_id: str,
        payload: Dict[str, Any],
        tenant_id: Optional[str] = None,
        actor_id: Optional[str] = None,
    ) -> Optional[dict]:
        clean = {k: v for k, v in payload.items() if v is not None}
        if not clean:
            return await self.get_by_id(doc_id, tenant_id)
        query = self._scope(tenant_id, {"_id": to_object_id(doc_id)})
        doc = await self.collection.find_one_and_update(
            query, {"$set": {**clean, **touch(actor_id)}}, return_document=True
        )
        return serialize(doc)

    async def soft_delete_by_id(
        self, doc_id: str, tenant_id: Optional[str] = None, actor_id: Optional[str] = None
    ) -> bool:
        from app.core.security import utcnow

        query = self._scope(tenant_id, {"_id": to_object_id(doc_id)})
        result = await self.collection.update_one(
            query,
            {"$set": {"is_deleted": True, "deleted_at": utcnow(), **touch(actor_id)}},
        )
        return result.modified_count > 0
