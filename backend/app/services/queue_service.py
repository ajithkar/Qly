"""Queue engine — Qly's core domain logic.

Responsibilities:
  * open / pause / resume / close a queue
  * issue tokens (atomically, respecting capacity and plan limits)
  * call next / recall / skip / complete / cancel / transfer, all guarded
  * compute estimated wait time and broadcast live monitor state
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.errors import Conflict, InvalidTransition, NotFound, ValidationError
from app.core.logging import get_logger
from app.core.security import ensure_utc, generate_numeric_code, hash_opaque_token, utcnow
from app.models.enums import (
    AccountStatus,
    QueueStatus,
    TokenPriority,
    TokenStatus,
    can_transition,
)
from app.repositories.catalog import (
    BranchRepository,
    ProviderRepository,
    ServiceRepository,
)
from app.repositories.identity import StaffRepository
from app.repositories.queues import (
    ConsoleAccessRepository,
    CounterRepository,
    QueueRepository,
    TokenRepository,
)
from app.services.notification_service import NotificationService
from app.websocket.manager import ws_manager

logger = get_logger(__name__)

CONSOLE_CODE_TTL_MINUTES = 30


def business_day_for(tz_name: str, moment: Optional[datetime] = None) -> str:
    """The local calendar day used for token numbering and 'today' metrics."""
    from zoneinfo import ZoneInfo

    moment = moment or utcnow()
    try:
        local = moment.astimezone(ZoneInfo(tz_name))
    except Exception:  # noqa: BLE001 - unknown tz falls back to UTC
        local = moment.astimezone(timezone.utc)
    return local.date().isoformat()


class QueueService:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.db = db
        self.queues = QueueRepository(db)
        self.tokens = TokenRepository(db)
        self.counters = CounterRepository(db)
        self.services = ServiceRepository(db)
        self.branches = BranchRepository(db)
        self.providers = ProviderRepository(db)
        self.staff = StaffRepository(db)
        self.console_access = ConsoleAccessRepository(db)
        self.notifications = NotificationService(db)

    # ------------------------------------------------------------------
    # Queue lifecycle
    # ------------------------------------------------------------------
    async def create_queue(
        self, tenant_id: str, payload: Dict[str, Any], actor_id: str
    ) -> dict:
        service = await self.services.get_by_id(payload["service_id"], tenant_id)
        if not service:
            raise NotFound("Service not found.")
        branch = await self.branches.get_by_id(payload["branch_id"], tenant_id)
        if not branch:
            raise NotFound("Branch not found.")

        day = business_day_for(branch.get("timezone", "UTC"))
        existing = await self.queues.find_open_queue(
            tenant_id, payload["branch_id"], payload["service_id"], day
        )
        if existing:
            raise Conflict(
                "An open queue already exists for this service today.",
                code="queue_already_open",
            )

        return await self.queues.create(
            {
                "name": payload["name"],
                "branch_id": payload["branch_id"],
                "service_id": payload["service_id"],
                "provider_id": payload.get("provider_id"),
                "max_tokens": payload.get("max_tokens") or service.get("queue_capacity", 100),
                "status": QueueStatus.DRAFT.value,
                "business_day": day,
            },
            tenant_id,
            actor_id,
        )

    async def change_queue_status(
        self,
        tenant_id: str,
        queue_id: str,
        action: str,
        actor_id: str,
        *,
        provider_id: Optional[str] = None,
    ) -> dict:
        transitions = {
            "start": (QueueStatus.OPEN, [QueueStatus.DRAFT, QueueStatus.PAUSED]),
            "pause": (QueueStatus.PAUSED, [QueueStatus.OPEN]),
            "resume": (QueueStatus.OPEN, [QueueStatus.PAUSED]),
            "close": (QueueStatus.CLOSED, [QueueStatus.OPEN, QueueStatus.PAUSED, QueueStatus.DRAFT]),
        }
        if action not in transitions:
            raise ValidationError(f"Unknown queue action '{action}'.")
        target, allowed = transitions[action]

        extra_fields = None
        if action == "start" and provider_id:
            if not await self.providers.get_by_id(provider_id, tenant_id):
                raise NotFound("Selected doctor/provider does not exist.")
            extra_fields = {"provider_id": provider_id}

        updated = await self.queues.set_status(
            queue_id,
            tenant_id,
            new_status=target,
            allowed_from=allowed,
            actor_id=actor_id,
            extra_fields=extra_fields,
        )
        if updated is None:
            current = await self.queues.get_by_id(queue_id, tenant_id)
            if current is None:
                raise NotFound("Queue not found.")
            raise InvalidTransition(
                f"Cannot {action} a queue that is currently '{current['status']}'."
            )

        if action == "close":
            # Ending a queue clears the line - nobody still waiting or being
            # served can be actioned once the queue is closed, so cancel them
            # rather than leave stale entries behind.
            cancelled = await self.tokens.cancel_active(queue_id, actor_id)
            for token in cancelled:
                await self.notifications.token_event(tenant_id, token, "cancelled")

        await self._broadcast(tenant_id, queue_id)
        await self.notifications.queue_status_changed(tenant_id, queue_id, target.value)
        return updated

    async def delete_queue(self, tenant_id: str, queue_id: str, actor_id: str) -> None:
        queue = await self.queues.get_by_id(queue_id, tenant_id)
        if not queue:
            raise NotFound("Queue not found.")
        if queue["status"] in (QueueStatus.OPEN.value, QueueStatus.PAUSED.value):
            raise Conflict(
                "End this queue before deleting it - people may still be waiting.",
                code="queue_still_active",
            )
        await self.queues.soft_delete_by_id(queue_id, tenant_id, actor_id)

    async def create_console_share(self, tenant_id: str, queue_id: str, actor_id: str) -> dict:
        """A one-time code an owner/manager hands to the assigned doctor so
        they can log in and open this queue's console - just their name and
        the code, no account setup. The doctor never needs a password: a
        console-only login record is created the first time their catalog
        Provider is shared, and it is only ever reachable through this code."""
        queue = await self.queues.get_by_id(queue_id, tenant_id)
        if not queue:
            raise NotFound("Queue not found.")
        provider_id = queue.get("provider_id")
        if not provider_id:
            raise ValidationError(
                "Assign a doctor to this queue (Start it) before sharing console access."
            )

        staff = await self.staff.get_by_provider_id(tenant_id, provider_id)
        if not staff:
            provider = await self.providers.get_by_id(provider_id, tenant_id)
            if not provider:
                raise NotFound("Selected doctor/provider does not exist.")
            staff = await self.staff.create(
                {
                    "email": f"provider-{provider_id}@console.local",
                    "name": provider["name"],
                    "role": "provider",
                    "branch_id": provider.get("branch_id"),
                    "provider_id": provider_id,
                    "custom_permissions": [],
                    "status": AccountStatus.ACTIVE.value,
                    "email_verified": True,
                    # No password - this login is reachable only via a
                    # console share code, never via /auth/login.
                    "password_hash": None,
                },
                tenant_id,
                actor_id,
            )

        raw_code = generate_numeric_code()
        expires_at = utcnow() + timedelta(minutes=CONSOLE_CODE_TTL_MINUTES)
        await self.console_access.create_code(
            tenant_id, queue_id, staff["id"], hash_opaque_token(raw_code), expires_at, actor_id
        )
        return {
            "queue_id": queue_id,
            "queue_name": queue["name"],
            "doctor_name": staff["name"],
            "code": raw_code,
            "expires_at": expires_at,
        }

    # ------------------------------------------------------------------
    # Token issuing
    # ------------------------------------------------------------------
    async def issue_token(
        self,
        tenant_id: str,
        queue_id: str,
        *,
        customer_name: Optional[str],
        customer_phone: Optional[str] = None,
        user_id: Optional[str] = None,
        priority: TokenPriority = TokenPriority.NORMAL,
        appointment_id: Optional[str] = None,
        actor_id: Optional[str] = None,
    ) -> dict:
        queue = await self.queues.get_by_id(queue_id, tenant_id)
        if not queue:
            raise NotFound("Queue not found.")
        if queue["status"] != QueueStatus.OPEN.value:
            raise Conflict(
                f"This queue is not accepting tokens (status: {queue['status']}).",
                code="queue_not_open",
            )

        active = await self.tokens.active_count(queue_id)
        if active >= int(queue.get("max_tokens", 100)):
            raise Conflict(
                "This queue has reached its capacity.", code="queue_capacity_reached"
            )

        service = await self.services.get_by_id(queue["service_id"], tenant_id)
        if not service:
            raise NotFound("Service not found.")

        # Atomic allocation - concurrent joins can never collide here.
        sequence = await self.counters.next_sequence(
            tenant_id, queue["branch_id"], queue["service_id"], queue["business_day"]
        )
        prefix = service.get("token_prefix") or ""
        token_number = f"{prefix}{sequence:03d}" if prefix else f"{sequence:03d}"

        token = await self.tokens.create_token(
            {
                "tenant_id": tenant_id,
                "queue_id": queue_id,
                "branch_id": queue["branch_id"],
                "service_id": queue["service_id"],
                "provider_id": queue.get("provider_id"),
                "business_day": queue["business_day"],
                "token_number": token_number,
                "sequence": sequence,
                "status": TokenStatus.WAITING.value,
                "priority": priority.value,
                "user_id": user_id,
                "appointment_id": appointment_id,
                "customer_name": customer_name,
                "customer_phone": customer_phone,
                "called_at": None,
                "served_at": None,
                "completed_at": None,
                "recall_count": 0,
            },
            actor_id,
        )

        enriched = await self.enrich_token(token)
        await self._broadcast(tenant_id, queue_id)
        await self.notifications.queue_joined(tenant_id, enriched)
        logger.info(
            "token_issued",
            extra={"queue_id": queue_id, "token": token_number, "tenant_id": tenant_id},
        )
        return enriched

    # ------------------------------------------------------------------
    # Operator actions
    # ------------------------------------------------------------------
    async def call_next(self, tenant_id: str, queue_id: str, actor_id: str) -> dict:
        queue = await self.queues.get_by_id(queue_id, tenant_id)
        if not queue:
            raise NotFound("Queue not found.")
        if queue["status"] not in (QueueStatus.OPEN.value, QueueStatus.PAUSED.value):
            raise Conflict("Queue is not active.", code="queue_not_active")

        token = await self.tokens.claim_next(queue_id, tenant_id, actor_id)
        if token is None:
            raise NotFound("There is nobody waiting in this queue.", code="queue_empty")

        enriched = await self.enrich_token(token)
        await self._broadcast(tenant_id, queue_id)
        await self.notifications.your_turn(tenant_id, enriched)
        return enriched

    async def recall(self, tenant_id: str, token_id: str, actor_id: str) -> dict:
        token = await self._require_token(tenant_id, token_id)
        if token["status"] != TokenStatus.CALLED.value:
            raise InvalidTransition("Only a called token can be recalled.")
        updated = await self.tokens.guarded_transition(
            token_id,
            tenant_id,
            expected=[TokenStatus.CALLED],
            target=TokenStatus.CALLED,
            extra_set={"called_at": utcnow(), "recall_count": token.get("recall_count", 0) + 1},
            actor_id=actor_id,
        )
        if updated is None:
            raise InvalidTransition("This token was already updated by someone else.")
        enriched = await self.enrich_token(updated)
        await self._broadcast(tenant_id, token["queue_id"])
        await self.notifications.your_turn(tenant_id, enriched, recall=True)
        return enriched

    async def start_serving(self, tenant_id: str, token_id: str, actor_id: str) -> dict:
        return await self._transition(
            tenant_id,
            token_id,
            expected=[TokenStatus.CALLED],
            target=TokenStatus.SERVING,
            extra_set={"served_at": utcnow()},
            actor_id=actor_id,
        )

    async def complete(self, tenant_id: str, token_id: str, actor_id: str) -> dict:
        token = await self._require_token(tenant_id, token_id)
        now = utcnow()
        updated = await self._transition(
            tenant_id,
            token_id,
            expected=[TokenStatus.SERVING, TokenStatus.CALLED],
            target=TokenStatus.COMPLETED,
            extra_set={"completed_at": now},
            actor_id=actor_id,
            notify="completed",
        )
        # Feed the rolling average that drives ETA.
        started = token.get("served_at") or token.get("called_at")
        if started:
            duration = (now - ensure_utc(started)).total_seconds()
            if 0 < duration < 86400:  # ignore obviously broken samples
                await self.tokens.record_service_duration(
                    tenant_id, token.get("provider_id"), token["service_id"], duration
                )
        return updated

    async def skip(self, tenant_id: str, token_id: str, actor_id: str) -> dict:
        return await self._transition(
            tenant_id,
            token_id,
            expected=[TokenStatus.WAITING, TokenStatus.CALLED],
            target=TokenStatus.SKIPPED,
            extra_set={"skipped_at": utcnow()},
            actor_id=actor_id,
        )

    async def mark_no_show(self, tenant_id: str, token_id: str, actor_id: str) -> dict:
        return await self._transition(
            tenant_id,
            token_id,
            expected=[TokenStatus.CALLED],
            target=TokenStatus.NO_SHOW,
            extra_set={"no_show_at": utcnow()},
            actor_id=actor_id,
        )

    async def cancel(self, tenant_id: str, token_id: str, actor_id: str) -> dict:
        return await self._transition(
            tenant_id,
            token_id,
            expected=[TokenStatus.WAITING, TokenStatus.CALLED, TokenStatus.SERVING],
            target=TokenStatus.CANCELLED,
            extra_set={"cancelled_at": utcnow()},
            actor_id=actor_id,
            notify="cancelled",
        )

    async def requeue(self, tenant_id: str, token_id: str, actor_id: str) -> dict:
        """Return a skipped or no-show token to the waiting line."""
        return await self._transition(
            tenant_id,
            token_id,
            expected=[TokenStatus.SKIPPED, TokenStatus.NO_SHOW],
            target=TokenStatus.WAITING,
            extra_set={"called_at": None},
            actor_id=actor_id,
        )

    async def transfer(
        self, tenant_id: str, token_id: str, target_queue_id: str, actor_id: str
    ) -> dict:
        token = await self._require_token(tenant_id, token_id)
        target = await self.queues.get_by_id(target_queue_id, tenant_id)
        if not target:
            raise NotFound("Target queue not found.")
        if target["status"] != QueueStatus.OPEN.value:
            raise Conflict("Target queue is not open.", code="queue_not_open")
        if target_queue_id == token["queue_id"]:
            raise ValidationError("Token is already in that queue.")

        # Close out the original token...
        closed = await self.tokens.guarded_transition(
            token_id,
            tenant_id,
            expected=[TokenStatus.WAITING, TokenStatus.CALLED, TokenStatus.SERVING],
            target=TokenStatus.TRANSFERRED,
            extra_set={"transferred_to_queue_id": target_queue_id, "transferred_at": utcnow()},
            actor_id=actor_id,
        )
        if closed is None:
            raise InvalidTransition("This token can no longer be transferred.")

        # ...and issue a fresh one in the destination queue.
        new_token = await self.issue_token(
            tenant_id,
            target_queue_id,
            customer_name=token.get("customer_name"),
            customer_phone=token.get("customer_phone"),
            user_id=token.get("user_id"),
            priority=TokenPriority(token.get("priority", TokenPriority.NORMAL.value)),
            actor_id=actor_id,
        )
        await self._broadcast(tenant_id, token["queue_id"])
        return new_token

    # ------------------------------------------------------------------
    # ETA + live monitor
    # ------------------------------------------------------------------
    async def average_service_seconds(
        self, tenant_id: str, service_id: str, provider_id: Optional[str]
    ) -> float:
        """Rolling average service time, falling back to the configured duration
        when there is not enough real data yet."""
        samples = await self.tokens.sample_count(
            tenant_id, service_id, provider_id, settings.ETA_ROLLING_WINDOW
        )
        if samples >= settings.ETA_MIN_SAMPLES:
            avg = await self.tokens.rolling_average_seconds(
                tenant_id, service_id, provider_id, settings.ETA_ROLLING_WINDOW
            )
            if avg:
                return avg
        service = await self.services.get_by_id(service_id, tenant_id)
        minutes = (service or {}).get("duration_minutes", 15)
        return float(minutes) * 60.0

    async def enrich_token(self, token: dict) -> dict:
        """Attach live position, people-ahead and ETA to a token."""
        out = dict(token)
        if token["status"] == TokenStatus.WAITING.value:
            ahead = await self.tokens.people_ahead(token["queue_id"], token)
            avg = await self.average_service_seconds(
                token["tenant_id"], token["service_id"], token.get("provider_id")
            )
            out["people_ahead"] = ahead
            out["position"] = ahead + 1
            out["estimated_wait_minutes"] = round((ahead * avg) / 60.0, 1)
        else:
            out["people_ahead"] = 0
            out["position"] = 0
            out["estimated_wait_minutes"] = 0.0
        return out

    async def live_monitor(self, tenant_id: str, queue_id: str) -> dict:
        queue = await self.queues.get_by_id(queue_id, tenant_id)
        if not queue:
            raise NotFound("Queue not found.")

        counts = await self.tokens.status_counts(queue_id)
        current = await self.tokens.current_active(queue_id)
        nxt = await self.tokens.peek_next(queue_id)
        avg_service = await self.average_service_seconds(
            tenant_id, queue["service_id"], queue.get("provider_id")
        )
        avg_wait = await self.tokens.average_wait_seconds(queue_id) or 0.0
        waiting = counts.get(TokenStatus.WAITING.value, 0)

        providers: List[dict] = []
        if queue.get("provider_id"):
            provider = await self.providers.get_by_id(queue["provider_id"], tenant_id)
            if provider:
                providers.append(
                    {
                        "provider_id": provider["id"],
                        "name": provider.get("name"),
                        "status": "serving" if current else "idle",
                    }
                )

        return {
            "queue_id": queue_id,
            "status": queue["status"],
            "current_token": await self.enrich_token(current) if current else None,
            "next_token": await self.enrich_token(nxt) if nxt else None,
            "waiting_count": waiting,
            "serving_count": counts.get(TokenStatus.SERVING.value, 0),
            "completed_count": counts.get(TokenStatus.COMPLETED.value, 0),
            "skipped_count": counts.get(TokenStatus.SKIPPED.value, 0),
            "no_show_count": counts.get(TokenStatus.NO_SHOW.value, 0),
            "average_wait_minutes": round(avg_wait / 60.0, 1),
            "average_service_minutes": round(avg_service / 60.0, 1),
            "estimated_wait_minutes": round((waiting * avg_service) / 60.0, 1),
            "provider_status": providers,
            "updated_at": utcnow(),
        }

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    async def _require_token(self, tenant_id: str, token_id: str) -> dict:
        token = await self.tokens.get_by_id(token_id, tenant_id)
        if not token:
            raise NotFound("Token not found.")
        return token

    async def _transition(
        self,
        tenant_id: str,
        token_id: str,
        *,
        expected: List[TokenStatus],
        target: TokenStatus,
        extra_set: Optional[Dict[str, Any]] = None,
        actor_id: Optional[str] = None,
        notify: Optional[str] = None,
    ) -> dict:
        token = await self._require_token(tenant_id, token_id)
        current = TokenStatus(token["status"])
        if not can_transition(current, target) and current != target:
            raise InvalidTransition(
                f"A token that is '{current.value}' cannot become '{target.value}'."
            )

        updated = await self.tokens.guarded_transition(
            token_id,
            tenant_id,
            expected=expected,
            target=target,
            extra_set=extra_set,
            actor_id=actor_id,
        )
        if updated is None:
            # The guard failed: somebody else changed this token first.
            raise InvalidTransition(
                "This token was already updated by another operator.",
                code="concurrent_update",
            )

        enriched = await self.enrich_token(updated)
        await self._broadcast(tenant_id, token["queue_id"])
        if notify:
            await self.notifications.token_event(tenant_id, enriched, notify)
        return enriched

    async def _broadcast(self, tenant_id: str, queue_id: str) -> None:
        """Push fresh monitor state to everyone watching this queue.

        Broadcasting goes through Redis pub/sub so it reaches clients connected
        to *other* application instances too.
        """
        try:
            payload = await self.live_monitor(tenant_id, queue_id)
            await ws_manager.broadcast(f"queue:{queue_id}", {"type": "queue_update", "payload": payload})
        except Exception:  # noqa: BLE001 - a broadcast failure must not fail the request
            logger.warning("broadcast_failed", extra={"queue_id": queue_id})
