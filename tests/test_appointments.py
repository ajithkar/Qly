"""Slot generation, booking rules and appointment/queue conversion."""
from datetime import datetime, timedelta, timezone

import pytest

from app.core.errors import Conflict, NotFound, SlotTaken, ValidationError
from app.models.enums import AppointmentStatus, TokenPriority
from app.services.appointment_service import AppointmentService


def _future_weekday_iso(days_ahead: int = 3) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days_ahead)).date().isoformat()


# ---------------------------------------------------------- slot generation
async def test_slots_are_generated_from_working_hours(db, tenant_id, seeded):
    day = _future_weekday_iso()
    result = await AppointmentService(db).available_slots(
        tenant_id, seeded["service"]["id"], seeded["provider"]["id"], day
    )
    # 09:00-17:00 in 10-minute steps = 48 slots.
    assert len(result["slots"]) == 48
    assert all(s["available"] for s in result["slots"])
    assert result["timezone"] == "UTC"


async def test_buffer_time_reduces_slot_count(db, tenant_id, seeded):
    from app.repositories.catalog import ServiceRepository

    await ServiceRepository(db).update(
        seeded["service"]["id"], {"buffer_minutes": 10}, tenant_id, "actor"
    )
    result = await AppointmentService(db).available_slots(
        tenant_id, seeded["service"]["id"], seeded["provider"]["id"], _future_weekday_iso()
    )
    # 10 min duration + 10 min buffer = 20 min steps across 8 hours.
    assert len(result["slots"]) == 24


async def test_provider_leave_blocks_the_whole_day(db, tenant_id, seeded):
    from app.repositories.catalog import ProviderRepository

    day = _future_weekday_iso()
    await ProviderRepository(db).update(
        seeded["provider"]["id"],
        {"leaves": [{"start_date": day, "end_date": day, "reason": "Annual leave"}]},
        tenant_id,
        "actor",
    )
    result = await AppointmentService(db).available_slots(
        tenant_id, seeded["service"]["id"], seeded["provider"]["id"], day
    )
    assert result["slots"] == []


async def test_branch_holiday_blocks_the_whole_day(db, tenant_id, seeded):
    from app.repositories.catalog import BranchRepository

    day = _future_weekday_iso()
    await BranchRepository(db).update(
        seeded["branch"]["id"], {"holidays": [day]}, tenant_id, "actor"
    )
    result = await AppointmentService(db).available_slots(
        tenant_id, seeded["service"]["id"], seeded["provider"]["id"], day
    )
    assert result["slots"] == []


async def test_malformed_date_is_rejected(db, tenant_id, seeded):
    with pytest.raises(ValidationError):
        await AppointmentService(db).available_slots(
            tenant_id, seeded["service"]["id"], seeded["provider"]["id"], "22-07-2026"
        )


async def test_unknown_service_raises_not_found(db, tenant_id, seeded):
    with pytest.raises(NotFound):
        await AppointmentService(db).available_slots(
            tenant_id, "64b7f9c2e1a3d4b5c6a7e000", seeded["provider"]["id"], _future_weekday_iso()
        )


# ----------------------------------------------------------------- booking
async def _first_slot(db, tenant_id, seeded):
    result = await AppointmentService(db).available_slots(
        tenant_id, seeded["service"]["id"], seeded["provider"]["id"], _future_weekday_iso()
    )
    return result["slots"][0]["start"]


async def test_booking_succeeds_and_marks_slot_taken(db, tenant_id, seeded):
    service = AppointmentService(db)
    slot = await _first_slot(db, tenant_id, seeded)

    appointment = await service.book(
        tenant_id,
        {
            "branch_id": seeded["branch"]["id"],
            "service_id": seeded["service"]["id"],
            "provider_id": seeded["provider"]["id"],
            "slot_start": slot,
            "customer_name": "Guest",
        },
        user_id="user-1",
    )
    assert appointment["status"] == AppointmentStatus.BOOKED.value
    assert appointment["payment_status"] == "due_at_venue"

    after = await service.available_slots(
        tenant_id, seeded["service"]["id"], seeded["provider"]["id"], _future_weekday_iso()
    )
    assert after["slots"][0]["available"] is False


async def test_double_booking_same_slot_is_rejected(db, tenant_id, seeded):
    service = AppointmentService(db)
    slot = await _first_slot(db, tenant_id, seeded)
    payload = {
        "branch_id": seeded["branch"]["id"],
        "service_id": seeded["service"]["id"],
        "provider_id": seeded["provider"]["id"],
        "slot_start": slot,
    }
    await service.book(tenant_id, payload, user_id="user-1")
    with pytest.raises(SlotTaken):
        await service.book(tenant_id, dict(payload), user_id="user-2")


async def test_cannot_book_in_the_past(db, tenant_id, seeded):
    with pytest.raises(ValidationError):
        await AppointmentService(db).book(
            tenant_id,
            {
                "branch_id": seeded["branch"]["id"],
                "service_id": seeded["service"]["id"],
                "provider_id": seeded["provider"]["id"],
                "slot_start": datetime.now(timezone.utc) - timedelta(days=1),
            },
            user_id="user-1",
        )


async def test_prepaid_service_starts_unpaid(db, tenant_id, seeded):
    """Payment status must not be trusted until Stripe confirms."""
    from app.repositories.catalog import ServiceRepository

    await ServiceRepository(db).update(
        seeded["service"]["id"], {"payment_mode": "prepaid_online"}, tenant_id, "actor"
    )
    slot = await _first_slot(db, tenant_id, seeded)
    appointment = await AppointmentService(db).book(
        tenant_id,
        {
            "branch_id": seeded["branch"]["id"],
            "service_id": seeded["service"]["id"],
            "provider_id": seeded["provider"]["id"],
            "slot_start": slot,
        },
        user_id="user-1",
    )
    assert appointment["payment_status"] == "pending"


# ------------------------------------------------------ cancel + check-in
async def test_cancel_frees_the_slot(db, tenant_id, seeded):
    service = AppointmentService(db)
    slot = await _first_slot(db, tenant_id, seeded)
    appointment = await service.book(
        tenant_id,
        {
            "branch_id": seeded["branch"]["id"],
            "service_id": seeded["service"]["id"],
            "provider_id": seeded["provider"]["id"],
            "slot_start": slot,
        },
        user_id="user-1",
    )
    cancelled = await service.cancel(tenant_id, appointment["id"], "user-1")
    assert cancelled["status"] == AppointmentStatus.CANCELLED.value

    after = await service.available_slots(
        tenant_id, seeded["service"]["id"], seeded["provider"]["id"], _future_weekday_iso()
    )
    assert after["slots"][0]["available"] is True


async def test_cancelling_twice_is_rejected(db, tenant_id, seeded):
    service = AppointmentService(db)
    slot = await _first_slot(db, tenant_id, seeded)
    appointment = await service.book(
        tenant_id,
        {
            "branch_id": seeded["branch"]["id"],
            "service_id": seeded["service"]["id"],
            "provider_id": seeded["provider"]["id"],
            "slot_start": slot,
        },
        user_id="user-1",
    )
    await service.cancel(tenant_id, appointment["id"], "user-1")
    with pytest.raises(Conflict):
        await service.cancel(tenant_id, appointment["id"], "user-1")


async def test_check_in_converts_appointment_to_queue_token(db, tenant_id, seeded):
    """The appointment -> queue conversion path."""
    service = AppointmentService(db)
    slot = await _first_slot(db, tenant_id, seeded)
    appointment = await service.book(
        tenant_id,
        {
            "branch_id": seeded["branch"]["id"],
            "service_id": seeded["service"]["id"],
            "provider_id": seeded["provider"]["id"],
            "slot_start": slot,
            "customer_name": "Guest",
        },
        user_id="user-1",
    )

    # The seeded queue's business_day must match today for check-in to find it.
    from app.repositories.queues import QueueRepository
    from app.services.queue_service import business_day_for

    await QueueRepository(db).update(
        seeded["queue"]["id"],
        {"business_day": business_day_for("UTC")},
        tenant_id,
        "actor",
    )

    token = await service.check_in(tenant_id, appointment["id"], "staff-1")
    assert token["status"] == "waiting"
    # Appointment holders outrank walk-ins.
    assert token["priority"] == TokenPriority.PRIORITY.value
    assert token["appointment_id"] == appointment["id"]
