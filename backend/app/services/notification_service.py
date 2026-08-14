"""Notification fan-out: stored in MongoDB, pushed over WebSocket, emailed.

SMS/WhatsApp is defined behind the same interface but ships disabled by
default (see SmsChannel). This is a deliberate, documented limitation rather
than an omission: a user who has closed the browser tab will not reliably see
a 'your turn' alert through in-app channels alone.
"""
from __future__ import annotations

from typing import Any, Dict, Optional, Protocol

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.logging import get_logger
from app.core.security import utcnow
from app.repositories.identity import UserRepository
from app.services.email_service import send_email
from app.websocket.manager import ws_manager

logger = get_logger(__name__)


class NotificationEvent:
    APPOINTMENT_CONFIRMED = "appointment_confirmed"
    APPOINTMENT_REMINDER = "appointment_reminder"
    APPOINTMENT_RESCHEDULED = "appointment_rescheduled"
    APPOINTMENT_CANCELLED = "appointment_cancelled"
    QUEUE_JOINED = "queue_joined"
    QUEUE_POSITION_CHANGED = "queue_position_changed"
    YOUR_TURN = "your_turn"
    CALLED = "called"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    QUEUE_STATUS_CHANGED = "queue_status_changed"


class Channel(Protocol):
    """All delivery channels share this interface, so adding SMS later is a
    registration change rather than a rewrite."""

    name: str
    enabled: bool

    async def send(self, recipient: Dict[str, Any], event: str, payload: Dict[str, Any]) -> None:
        ...


class EmailChannel:
    name = "email"
    enabled = True

    async def send(self, recipient, event, payload):  # noqa: ANN001
        email = recipient.get("email")
        if not email:
            logger.info("email_skipped_no_address", extra={"event": event})
            return
        await send_email(email, payload["title"], payload["body"])


class SmsChannel:
    """Disabled by default - enable once an SMS/WhatsApp provider is configured."""

    name = "sms"
    enabled = False

    async def send(self, recipient, event, payload):  # noqa: ANN001
        if not self.enabled:
            return
        logger.info("sms_queued", extra={"event": event, "channel": "sms"})


class NotificationService:
    #

    # Events that warrant reaching the user outside the app.
    HIGH_PRIORITY = {NotificationEvent.YOUR_TURN, NotificationEvent.APPOINTMENT_REMINDER}

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.db = db
        self.channels = [EmailChannel(), SmsChannel()]

    async def create(
        self,
        *,
        tenant_id: Optional[str],
        recipient_id: Optional[str],
        recipient_type: str,
        event: str,
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None,
    ) -> dict:
        doc = {
            "tenant_id": tenant_id,
            "recipient_id": recipient_id,
            "recipient_type": recipient_type,
            "event": event,
            "title": title,
            "body": body,
            "data": data or {},
            "read": False,
            "created_at": utcnow(),
        }
        result = await self.db["notifications"].insert_one(doc)
        doc["id"] = str(result.inserted_id)
        doc.pop("_id", None)

        # Real-time push to the recipient's personal channel.
        if recipient_id:
            await ws_manager.broadcast(
                f"user:{recipient_id}", {"type": "notification", "payload": doc}
            )

        if event in self.HIGH_PRIORITY and recipient_id:
            prefs = await self._preferences(recipient_id)
            if not self._in_quiet_hours(prefs):
                # Preferences only ever held email_enabled/sms_enabled/quiet_hours -
                # the actual address lives on the user record itself.
                user = await UserRepository(self.db).get_by_id(recipient_id)
                recipient = {"id": recipient_id, "email": (user or {}).get("email")}
                for channel in self.channels:
                    if channel.enabled and prefs.get(f"{channel.name}_enabled", True):
                        await channel.send(recipient, event, doc)
        return doc

    async def _preferences(self, recipient_id: str) -> Dict[str, Any]:
        prefs = await self.db["notification_preferences"].find_one(
            {"recipient_id": recipient_id}
        )
        return prefs or {}

    @staticmethod
    def _in_quiet_hours(prefs: Dict[str, Any]) -> bool:
        window = prefs.get("quiet_hours")
        if not window:
            return False
        now_hour = utcnow().hour
        start, end = window.get("start_hour"), window.get("end_hour")
        if start is None or end is None:
            return False
        if start <= end:
            return start <= now_hour < end
        return now_hour >= start or now_hour < end  # window crosses midnight

    # -- convenience wrappers used by the queue engine -------------------
    async def queue_joined(self, tenant_id: str, token: dict) -> None:
        if not token.get("user_id"):
            return
        await self.create(
            tenant_id=tenant_id,
            recipient_id=token["user_id"],
            recipient_type="user",
            event=NotificationEvent.QUEUE_JOINED,
            title=f"You joined the queue - token {token['token_number']}",
            body=(
                f"You are number {token.get('position', '?')} in line. "
                f"Estimated wait: {token.get('estimated_wait_minutes', 0)} minutes."
            ),
            data={"token_id": token.get("id"), "queue_id": token.get("queue_id")},
        )

    async def your_turn(self, tenant_id: str, token: dict, recall: bool = False) -> None:
        if not token.get("user_id"):
            return
        await self.create(
            tenant_id=tenant_id,
            recipient_id=token["user_id"],
            recipient_type="user",
            event=NotificationEvent.YOUR_TURN,
            title="It's your turn" + (" (final call)" if recall else ""),
            body=f"Token {token['token_number']} is being called. Please proceed to the counter.",
            data={"token_id": token.get("id"), "queue_id": token.get("queue_id")},
        )

    async def token_event(self, tenant_id: str, token: dict, event: str) -> None:
        if not token.get("user_id"):
            return
        titles = {
            "completed": "Your service is complete",
            "cancelled": "Your token was cancelled",
        }
        await self.create(
            tenant_id=tenant_id,
            recipient_id=token["user_id"],
            recipient_type="user",
            event=event,
            title=titles.get(event, "Queue update"),
            body=f"Token {token['token_number']}: {event}.",
            data={"token_id": token.get("id")},
        )

    async def queue_status_changed(self, tenant_id: str, queue_id: str, status: str) -> None:
        await ws_manager.broadcast(
            f"queue:{queue_id}",
            {"type": "queue_status", "payload": {"queue_id": queue_id, "status": status}},
        )

    async def appointment_event(
        self, tenant_id: str, appointment: dict, event: str, title: str, body: str
    ) -> None:
        if not appointment.get("user_id"):
            return
        await self.create(
            tenant_id=tenant_id,
            recipient_id=appointment["user_id"],
            recipient_type="user",
            event=event,
            title=title,
            body=body,
            data={"appointment_id": appointment.get("id")},
        )
