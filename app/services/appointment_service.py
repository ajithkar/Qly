"""Slot generation and appointment booking.

Slot availability is derived, never stored: provider working hours, minus
holidays and leave, minus already-booked slots, chunked by
(service duration + buffer). Booking relies on the unique partial index
`uniq_active_slot` so two simultaneous bookings cannot both succeed - the
loser gets a clean 409 rather than a silent double-booking.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.core.errors import Conflict, NotFound, SlotTaken, ValidationError
from app.core.logging import get_logger
from app.core.security import utcnow
from app.models.base import new_audit
from app.models.enums import AppointmentStatus, PaymentMode, TokenPriority
from app.repositories.catalog import (
    AppointmentRepository,
    BranchRepository,
    ProviderRepository,
    ServiceRepository,
)
from app.repositories.queues import QueueRepository
from app.services.notification_service import NotificationEvent, NotificationService
from app.services.queue_service import QueueService, business_day_for

logger = get_logger(__name__)


class AppointmentService:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.db = db
        self.appointments = AppointmentRepository(db)
        self.services = ServiceRepository(db)
        self.providers = ProviderRepository(db)
        self.branches = BranchRepository(db)
        self.queues = QueueRepository(db)
        self.notifications = NotificationService(db)
        self.queue_service = QueueService(db)

    # ------------------------------------------------------------------
    # Slot generation
    # ------------------------------------------------------------------
    async def available_slots(
        self, tenant_id: str, service_id: str, provider_id: str, day: str
    ) -> Dict[str, Any]:
        service = await self.services.get_by_id(service_id, tenant_id)
        if not service:
            raise NotFound("Service not found.")
        provider = await self.providers.get_by_id(provider_id, tenant_id)
        if not provider:
            raise NotFound("Provider not found.")
        branch = await self.branches.get_by_id(service["branch_id"], tenant_id)
        tz_name = (branch or {}).get("timezone", "UTC")

        try:
            target_date = date.fromisoformat(day)
        except ValueError:
            raise ValidationError("Date must be in YYYY-MM-DD format.")

        tz = self._zone(tz_name)
        slots: List[Dict[str, Any]] = []

        if self._is_unavailable(provider, branch, target_date):
            return {
                "service_id": service_id,
                "provider_id": provider_id,
                "date": day,
                "timezone": tz_name,
                "slots": [],
            }

        hours = self._hours_for_weekday(provider, target_date.weekday())
        if hours is None:
            return {
                "service_id": service_id,
                "provider_id": provider_id,
                "date": day,
                "timezone": tz_name,
                "slots": [],
            }

        step = int(service["duration_minutes"]) + int(service.get("buffer_minutes", 0))
        if step <= 0:
            raise ValidationError("Service duration must be greater than zero.")

        day_start = datetime.combine(target_date, self._as_time(hours["opens_at"]), tzinfo=tz)
        day_end = datetime.combine(target_date, self._as_time(hours["closes_at"]), tzinfo=tz)

        booked = await self.appointments.booked_between(
            tenant_id,
            provider_id,
            day_start.astimezone(ZoneInfo("UTC")),
            day_end.astimezone(ZoneInfo("UTC")),
        )
        taken = {self._normalise(a["slot_start"]) for a in booked}

        cursor = day_start
        now = utcnow()
        while cursor + timedelta(minutes=int(service["duration_minutes"])) <= day_end:
            start_utc = cursor.astimezone(ZoneInfo("UTC"))
            end_utc = start_utc + timedelta(minutes=int(service["duration_minutes"]))
            slots.append(
                {
                    "start": start_utc,
                    "end": end_utc,
                    "available": start_utc not in taken and start_utc > now,
                }
            )
            cursor += timedelta(minutes=step)

        return {
            "service_id": service_id,
            "provider_id": provider_id,
            "date": day,
            "timezone": tz_name,
            "slots": slots,
        }

    # ------------------------------------------------------------------
    # Booking
    # ------------------------------------------------------------------
    async def book(
        self,
        tenant_id: str,
        payload: Dict[str, Any],
        *,
        user_id: Optional[str] = None,
        actor_id: Optional[str] = None,
    ) -> dict:
        service = await self.services.get_by_id(payload["service_id"], tenant_id)
        if not service:
            raise NotFound("Service not found.")
        provider = await self.providers.get_by_id(payload["provider_id"], tenant_id)
        if not provider:
            raise NotFound("Provider not found.")
        branch = await self.branches.get_by_id(payload["branch_id"], tenant_id)
        if not branch:
            raise NotFound("Branch not found.")

        slot_start = self._normalise(payload["slot_start"])
        if slot_start <= utcnow():
            raise ValidationError("Cannot book a slot in the past.")

        # Confirm the slot is one the schedule actually offers.
        tz_name = branch.get("timezone", "UTC")
        local_day = slot_start.astimezone(self._zone(tz_name)).date().isoformat()
        offered = await self.available_slots(
            tenant_id, payload["service_id"], payload["provider_id"], local_day
        )
        if not any(s["start"] == slot_start and s["available"] for s in offered["slots"]):
            raise SlotTaken("That slot is not available.")

        duration = int(service["duration_minutes"])
        payment_mode = service.get("payment_mode", PaymentMode.PAY_AT_VENUE.value)

        document = {
            "tenant_id": tenant_id,
            "branch_id": payload["branch_id"],
            "service_id": payload["service_id"],
            "provider_id": payload["provider_id"],
            "user_id": user_id,
            "status": AppointmentStatus.BOOKED.value,
            "payment_mode": payment_mode,
            # Prepaid bookings stay unpaid until Stripe confirms via webhook.
            "payment_status": "pending"
            if payment_mode == PaymentMode.PREPAID_ONLINE.value
            else "due_at_venue",
            "price": float(service.get("price", 0)),
            "slot_start": slot_start,
            "slot_end": slot_start + timedelta(minutes=duration),
            "business_day": business_day_for(tz_name, slot_start),
            "customer_name": payload.get("customer_name"),
            "customer_phone": payload.get("customer_phone"),
            "notes": payload.get("notes"),
            "queue_token_id": None,
            **new_audit(actor_id),
        }

        try:
            result = await self.appointments.collection.insert_one(document)
        except DuplicateKeyError:
            # The unique index did its job under a race.
            raise SlotTaken()

        document["id"] = str(result.inserted_id)
        document.pop("_id", None)

        await self.notifications.appointment_event(
            tenant_id,
            document,
            NotificationEvent.APPOINTMENT_CONFIRMED,
            "Appointment booked",
            f"Your appointment is confirmed for {slot_start.isoformat()}.",
        )
        logger.info("appointment_booked", extra={"tenant_id": tenant_id, "id": document["id"]})
        return document

    async def reschedule(
        self, tenant_id: str, appointment_id: str, new_start: datetime, actor_id: str
    ) -> dict:
        appointment = await self.appointments.get_by_id(appointment_id, tenant_id)
        if not appointment:
            raise NotFound("Appointment not found.")
        if appointment["status"] not in (
            AppointmentStatus.BOOKED.value,
            AppointmentStatus.CONFIRMED.value,
        ):
            raise Conflict("Only an active appointment can be rescheduled.")

        service = await self.services.get_by_id(appointment["service_id"], tenant_id)
        branch = await self.branches.get_by_id(appointment["branch_id"], tenant_id)
        tz_name = (branch or {}).get("timezone", "UTC")
        start = self._normalise(new_start)
        local_day = start.astimezone(self._zone(tz_name)).date().isoformat()

        offered = await self.available_slots(
            tenant_id, appointment["service_id"], appointment["provider_id"], local_day
        )
        if not any(s["start"] == start and s["available"] for s in offered["slots"]):
            raise SlotTaken("That slot is not available.")

        duration = int((service or {}).get("duration_minutes", 15))
        try:
            updated = await self.appointments.update(
                appointment_id,
                {
                    "slot_start": start,
                    "slot_end": start + timedelta(minutes=duration),
                    "business_day": business_day_for(tz_name, start),
                },
                tenant_id,
                actor_id,
            )
        except DuplicateKeyError:
            raise SlotTaken()

        await self.notifications.appointment_event(
            tenant_id,
            updated or appointment,
            NotificationEvent.APPOINTMENT_RESCHEDULED,
            "Appointment rescheduled",
            f"Your appointment has moved to {start.isoformat()}.",
        )
        return updated or appointment

    async def cancel(
        self, tenant_id: str, appointment_id: str, actor_id: str, reason: Optional[str] = None
    ) -> dict:
        appointment = await self.appointments.get_by_id(appointment_id, tenant_id)
        if not appointment:
            raise NotFound("Appointment not found.")

        service = await self.services.get_by_id(appointment["service_id"], tenant_id)
        window = int((service or {}).get("cancellation_window_minutes", 0))
        slot_start = self._normalise(appointment["slot_start"])
        late = utcnow() > slot_start - timedelta(minutes=window)

        updated = await self.appointments.guarded_status_change(
            appointment_id,
            tenant_id,
            expected=[
                AppointmentStatus.BOOKED.value,
                AppointmentStatus.CONFIRMED.value,
            ],
            target=AppointmentStatus.CANCELLED.value,
            extra_set={
                "cancelled_at": utcnow(),
                "cancellation_reason": reason,
                "late_cancellation": late,
            },
            actor_id=actor_id,
        )
        if updated is None:
            raise Conflict("This appointment can no longer be cancelled.")

        await self.notifications.appointment_event(
            tenant_id,
            updated,
            NotificationEvent.APPOINTMENT_CANCELLED,
            "Appointment cancelled",
            "Your appointment has been cancelled.",
        )
        return updated

    # ------------------------------------------------------------------
    # Appointment -> queue conversion
    # ------------------------------------------------------------------
    async def check_in(self, tenant_id: str, appointment_id: str, actor_id: str) -> dict:
        """An appointment holder arrives and enters the live queue."""
        appointment = await self.appointments.get_by_id(appointment_id, tenant_id)
        if not appointment:
            raise NotFound("Appointment not found.")
        if appointment["status"] not in (
            AppointmentStatus.BOOKED.value,
            AppointmentStatus.CONFIRMED.value,
        ):
            raise Conflict("Only an active appointment can be checked in.")

        branch = await self.branches.get_by_id(appointment["branch_id"], tenant_id)
        day = business_day_for((branch or {}).get("timezone", "UTC"))
        queue = await self.queues.find_open_queue(
            tenant_id, appointment["branch_id"], appointment["service_id"], day
        )
        if not queue:
            raise Conflict(
                "There is no open queue for this service today.", code="no_open_queue"
            )

        # Appointment holders enter ahead of walk-ins - they already have a slot.
        token = await self.queue_service.issue_token(
            tenant_id,
            queue["id"],
            customer_name=appointment.get("customer_name"),
            customer_phone=appointment.get("customer_phone"),
            user_id=appointment.get("user_id"),
            priority=TokenPriority.PRIORITY,
            appointment_id=appointment_id,
            actor_id=actor_id,
        )

        await self.appointments.guarded_status_change(
            appointment_id,
            tenant_id,
            expected=[AppointmentStatus.BOOKED.value, AppointmentStatus.CONFIRMED.value],
            target=AppointmentStatus.CHECKED_IN.value,
            extra_set={"queue_token_id": token["id"], "checked_in_at": utcnow()},
            actor_id=actor_id,
        )
        return token

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _zone(tz_name: str) -> ZoneInfo:
        try:
            return ZoneInfo(tz_name)
        except Exception:  # noqa: BLE001
            return ZoneInfo("UTC")

    @staticmethod
    def _normalise(value: Any) -> datetime:
        """All comparisons happen in UTC; naive input is treated as UTC."""
        if isinstance(value, str):
            value = datetime.fromisoformat(value)
        if value.tzinfo is None:
            return value.replace(tzinfo=ZoneInfo("UTC"))
        return value.astimezone(ZoneInfo("UTC"))

    @staticmethod
    def _as_time(value: Any) -> time:
        if isinstance(value, time):
            return value
        if isinstance(value, str):
            return time.fromisoformat(value)
        if isinstance(value, datetime):
            return value.time()
        raise ValidationError("Invalid working-hours value.")

    @staticmethod
    def _hours_for_weekday(provider: dict, weekday: int) -> Optional[dict]:
        for entry in provider.get("working_hours", []) or []:
            if int(entry.get("weekday", -1)) == weekday:
                if entry.get("is_closed"):
                    return None
                return entry
        return None

    @staticmethod
    def _is_unavailable(provider: dict, branch: Optional[dict], target: date) -> bool:
        iso = target.isoformat()
        if iso in ((branch or {}).get("holidays") or []):
            return True
        for leave in provider.get("leaves", []) or []:
            try:
                start = date.fromisoformat(leave["start_date"])
                end = date.fromisoformat(leave["end_date"])
            except (KeyError, ValueError):
                continue
            if start <= target <= end:
                return True
        return False
