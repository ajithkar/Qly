"""Queue, token and counter repositories.

This is the concurrency-critical part of Qly. Two guarantees matter:

1. **Token allocation is atomic.** A single `find_one_and_update` with `$inc`
   and `upsert=True` on the per-(tenant, branch, service, business_day) counter
   means two simultaneous joins can never receive the same number.

2. **State transitions are guarded.** Every status change is a conditional
   `find_one_and_update` filtered on the *expected current status*, so if two
   operators press "Call Next" at the same moment, exactly one wins and the
   other gets a clean `InvalidTransition` instead of a double-serve.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from app.core.security import utcnow
from app.models.base import new_audit, serialize, to_object_id, touch
from app.models.enums import (
    ACTIVE_TOKEN_STATUSES,
    QueueStatus,
    TokenPriority,
    TokenStatus,
)
from app.repositories.base import BaseRepository

# Emergency is served before priority, which is served before normal.
PRIORITY_RANK: Dict[str, int] = {
    TokenPriority.EMERGENCY.value: 0,
    TokenPriority.PRIORITY.value: 1,
    TokenPriority.NORMAL.value: 2,
}


class QueueRepository(BaseRepository):
    collection_name = "queues"
    searchable_fields = ("name",)

    async def find_open_queue(
        self, tenant_id: str, branch_id: str, service_id: str, business_day: str
    ) -> Optional[dict]:
        return await self.find_one(
            {
                "branch_id": branch_id,
                "service_id": service_id,
                "business_day": business_day,
                "status": {"$in": [QueueStatus.OPEN.value, QueueStatus.PAUSED.value]},
            },
            tenant_id,
        )

    async def list_active(self, tenant_id: str, limit: int = 100) -> List[dict]:
        """Non-closed queues for the controller overview board, open queues first."""
        cursor = (
            self.collection.find(
                {
                    "tenant_id": tenant_id,
                    "is_deleted": False,
                    "status": {"$ne": QueueStatus.CLOSED.value},
                }
            )
            .sort([("status", 1), ("name", 1)])
            .limit(limit)
        )
        return [serialize(doc) for doc in await cursor.to_list(length=limit)]

    async def set_status(
        self,
        queue_id: str,
        tenant_id: str,
        *,
        new_status: QueueStatus,
        allowed_from: Sequence[QueueStatus],
        actor_id: Optional[str] = None,
    ) -> Optional[dict]:
        """Guarded queue status change; returns None if the guard failed."""
        doc = await self.collection.find_one_and_update(
            {
                "_id": to_object_id(queue_id),
                "tenant_id": tenant_id,
                "is_deleted": False,
                "status": {"$in": [s.value for s in allowed_from]},
            },
            {"$set": {"status": new_status.value, **touch(actor_id)}},
            return_document=True,
        )
        return serialize(doc)


class CounterRepository(BaseRepository):
    """Atomic per-day token counters."""

    collection_name = "queue_counters"
    soft_delete = False

    async def next_sequence(
        self, tenant_id: str, branch_id: str, service_id: str, business_day: str
    ) -> int:
        """Atomically allocate the next token number.

        `$inc` with `upsert=True` is a single atomic operation on one document,
        so concurrent callers are serialised by the server. No lock needed.
        """
        doc = await self.collection.find_one_and_update(
            {
                "tenant_id": tenant_id,
                "branch_id": branch_id,
                "service_id": service_id,
                "business_day": business_day,
            },
            {"$inc": {"sequence": 1}, "$setOnInsert": {"created_at": utcnow()}},
            upsert=True,
            return_document=True,
        )
        return int(doc["sequence"])

    async def issued_today(
        self, tenant_id: str, branch_id: str, service_id: str, business_day: str
    ) -> int:
        doc = await self.collection.find_one(
            {
                "tenant_id": tenant_id,
                "branch_id": branch_id,
                "service_id": service_id,
                "business_day": business_day,
            }
        )
        return int(doc["sequence"]) if doc else 0


class TokenRepository(BaseRepository):
    collection_name = "queue_tokens"
    soft_delete = False
    searchable_fields = ("token_number", "customer_name", "customer_phone")

    # -- ordering --------------------------------------------------------
    @staticmethod
    def _ordering() -> List[tuple]:
        """Serving order: emergency first, then priority, then arrival."""
        return [("priority_rank", 1), ("sequence", 1)]

    async def waiting_tokens(self, queue_id: str, limit: int = 0) -> List[dict]:
        cursor = self.collection.find(
            {"queue_id": queue_id, "status": TokenStatus.WAITING.value}
        ).sort(self._ordering())
        if limit:
            cursor = cursor.limit(limit)
        return [serialize(d) for d in await cursor.to_list(length=limit or 1000)]

    async def peek_next(self, queue_id: str) -> Optional[dict]:
        docs = await self.waiting_tokens(queue_id, limit=1)
        return docs[0] if docs else None

    async def current_active(self, queue_id: str) -> Optional[dict]:
        doc = await self.collection.find_one(
            {
                "queue_id": queue_id,
                "status": {"$in": [TokenStatus.CALLED.value, TokenStatus.SERVING.value]},
            },
            sort=[("called_at", -1)],
        )
        return serialize(doc)

    async def people_ahead(self, queue_id: str, token: dict) -> int:
        """Count tokens that will be served before this one."""
        rank = token.get("priority_rank", PRIORITY_RANK[TokenPriority.NORMAL.value])
        return await self.collection.count_documents(
            {
                "queue_id": queue_id,
                "status": TokenStatus.WAITING.value,
                "$or": [
                    {"priority_rank": {"$lt": rank}},
                    {"priority_rank": rank, "sequence": {"$lt": token["sequence"]}},
                ],
            }
        )

    async def status_counts(self, queue_id: str) -> Dict[str, int]:
        pipeline = [
            {"$match": {"queue_id": queue_id}},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        ]
        counts = {s.value: 0 for s in TokenStatus}
        async for row in self.collection.aggregate(pipeline):
            counts[row["_id"]] = row["count"]
        return counts

    async def active_count(self, queue_id: str) -> int:
        return await self.collection.count_documents(
            {"queue_id": queue_id, "status": {"$in": ACTIVE_TOKEN_STATUSES}}
        )

    # -- writes ----------------------------------------------------------
    async def create_token(self, payload: Dict[str, Any], actor_id: Optional[str] = None) -> dict:
        doc = {
            **payload,
            "priority_rank": PRIORITY_RANK.get(
                payload.get("priority", TokenPriority.NORMAL.value),
                PRIORITY_RANK[TokenPriority.NORMAL.value],
            ),
            **new_audit(actor_id),
        }
        result = await self.collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return serialize(doc)

    async def guarded_transition(
        self,
        token_id: str,
        tenant_id: str,
        *,
        expected: Sequence[TokenStatus],
        target: TokenStatus,
        extra_set: Optional[Dict[str, Any]] = None,
        actor_id: Optional[str] = None,
    ) -> Optional[dict]:
        """Conditional status change.

        Returns the updated document, or None when the guard did not match —
        which means another operator already acted on this token.
        """
        updates: Dict[str, Any] = {
            "status": target.value,
            **(extra_set or {}),
            **touch(actor_id),
        }
        doc = await self.collection.find_one_and_update(
            {
                "_id": to_object_id(token_id),
                "tenant_id": tenant_id,
                "status": {"$in": [s.value for s in expected]},
            },
            {"$set": updates},
            return_document=True,
        )
        return serialize(doc)

    async def claim_next(
        self, queue_id: str, tenant_id: str, actor_id: Optional[str] = None
    ) -> Optional[dict]:
        """Atomically claim the next waiting token for calling.

        Implemented as: read the head of the line, then attempt a guarded
        transition on that exact id. If another operator claimed it first the
        guard fails and we retry with the new head. Bounded retries prevent
        an unbounded loop under heavy contention.
        """
        for _ in range(5):
            candidate = await self.peek_next(queue_id)
            if candidate is None:
                return None
            claimed = await self.guarded_transition(
                candidate["id"],
                tenant_id,
                expected=[TokenStatus.WAITING],
                target=TokenStatus.CALLED,
                extra_set={"called_at": utcnow(), "recall_count": 0},
                actor_id=actor_id,
            )
            if claimed is not None:
                return claimed
        return None

    async def record_service_duration(
        self,
        tenant_id: str,
        provider_id: Optional[str],
        service_id: str,
        seconds: float,
    ) -> None:
        """Feed the rolling average used by the ETA calculation."""
        await self.db["service_durations"].insert_one(
            {
                "tenant_id": tenant_id,
                "provider_id": provider_id,
                "service_id": service_id,
                "duration_seconds": seconds,
                "completed_at": utcnow(),
            }
        )

    async def rolling_average_seconds(
        self,
        tenant_id: str,
        service_id: str,
        provider_id: Optional[str],
        window: int,
    ) -> Optional[float]:
        query: Dict[str, Any] = {"tenant_id": tenant_id, "service_id": service_id}
        if provider_id:
            query["provider_id"] = provider_id
        cursor = (
            self.db["service_durations"]
            .find(query, {"duration_seconds": 1})
            .sort("completed_at", -1)
            .limit(window)
        )
        rows = await cursor.to_list(length=window)
        if not rows:
            return None
        return sum(r["duration_seconds"] for r in rows) / len(rows)

    async def sample_count(
        self, tenant_id: str, service_id: str, provider_id: Optional[str], window: int
    ) -> int:
        query: Dict[str, Any] = {"tenant_id": tenant_id, "service_id": service_id}
        if provider_id:
            query["provider_id"] = provider_id
        return await self.db["service_durations"].count_documents(query, limit=window)

    async def average_wait_seconds(self, queue_id: str) -> Optional[float]:
        """Average time from joining the queue to being called."""
        pipeline = [
            {
                "$match": {
                    "queue_id": queue_id,
                    "called_at": {"$ne": None},
                    "created_at": {"$ne": None},
                }
            },
            {
                "$project": {
                    "wait": {"$subtract": ["$called_at", "$created_at"]},
                }
            },
            {"$group": {"_id": None, "avg": {"$avg": "$wait"}}},
        ]
        rows = await self.collection.aggregate(pipeline).to_list(length=1)
        if not rows or rows[0].get("avg") is None:
            return None
        return float(rows[0]["avg"]) / 1000.0
