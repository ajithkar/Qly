"""Queue engine: token allocation, guarded transitions, ETA, capacity."""
import asyncio

import pytest

from app.core.errors import Conflict, InvalidTransition, NotFound
from app.models.enums import TokenPriority, TokenStatus, can_transition
from app.repositories.queues import CounterRepository, TokenRepository
from app.services.queue_service import QueueService, business_day_for


# ------------------------------------------------------------ state machine
def test_valid_and_invalid_transitions():
    assert can_transition(TokenStatus.WAITING, TokenStatus.CALLED)
    assert can_transition(TokenStatus.CALLED, TokenStatus.SERVING)
    assert can_transition(TokenStatus.SERVING, TokenStatus.COMPLETED)
    # A completed token is terminal.
    assert not can_transition(TokenStatus.COMPLETED, TokenStatus.SERVING)
    # You cannot serve someone who was never called.
    assert not can_transition(TokenStatus.WAITING, TokenStatus.SERVING)


def test_business_day_respects_timezone():
    # Same instant, different local calendar days.
    from datetime import datetime, timezone

    moment = datetime(2026, 7, 22, 23, 30, tzinfo=timezone.utc)
    assert business_day_for("UTC", moment) == "2026-07-22"
    assert business_day_for("Asia/Kolkata", moment) == "2026-07-23"


# --------------------------------------------------------- token allocation
async def test_counter_allocates_sequentially(db, tenant_id):
    counters = CounterRepository(db)
    seen = []
    for _ in range(5):
        seen.append(await counters.next_sequence(tenant_id, "b1", "s1", "2026-07-22"))
    assert seen == [1, 2, 3, 4, 5]


async def test_counter_is_scoped_per_service_and_day(db, tenant_id):
    counters = CounterRepository(db)
    a = await counters.next_sequence(tenant_id, "b1", "service-a", "2026-07-22")
    b = await counters.next_sequence(tenant_id, "b1", "service-b", "2026-07-22")
    c = await counters.next_sequence(tenant_id, "b1", "service-a", "2026-07-23")
    # Each (service, day) pair starts its own numbering.
    assert a == b == c == 1


async def test_concurrent_joins_get_unique_numbers(db, tenant_id, seeded):
    """Twenty simultaneous joins must produce twenty distinct tokens."""
    service = QueueService(db)
    queue_id = seeded["queue"]["id"]

    results = await asyncio.gather(
        *[
            service.issue_token(tenant_id, queue_id, customer_name=f"Guest {i}")
            for i in range(20)
        ]
    )
    numbers = [t["token_number"] for t in results]
    assert len(set(numbers)) == 20, "duplicate token numbers were issued"
    assert sorted(t["sequence"] for t in results) == list(range(1, 21))


async def test_token_number_uses_service_prefix(db, tenant_id, seeded):
    token = await QueueService(db).issue_token(
        tenant_id, seeded["queue"]["id"], customer_name="Guest"
    )
    assert token["token_number"] == "A001"


# ------------------------------------------------------------ queue guards
async def test_cannot_issue_token_when_queue_closed(db, tenant_id, seeded):
    service = QueueService(db)
    await service.change_queue_status(tenant_id, seeded["queue"]["id"], "close", "actor")
    with pytest.raises(Conflict):
        await service.issue_token(tenant_id, seeded["queue"]["id"], customer_name="Guest")


async def test_queue_capacity_is_enforced(db, tenant_id, seeded):
    from app.repositories.queues import QueueRepository

    await QueueRepository(db).update(
        seeded["queue"]["id"], {"max_tokens": 2}, tenant_id, "actor"
    )
    service = QueueService(db)
    await service.issue_token(tenant_id, seeded["queue"]["id"], customer_name="One")
    await service.issue_token(tenant_id, seeded["queue"]["id"], customer_name="Two")
    with pytest.raises(Conflict):
        await service.issue_token(tenant_id, seeded["queue"]["id"], customer_name="Three")


async def test_invalid_queue_action_rejected(db, tenant_id, seeded):
    from app.core.errors import ValidationError

    with pytest.raises(ValidationError):
        await QueueService(db).change_queue_status(
            tenant_id, seeded["queue"]["id"], "explode", "actor"
        )


async def test_cannot_resume_a_queue_that_is_not_paused(db, tenant_id, seeded):
    # Queue is already open; resume is only valid from paused.
    with pytest.raises(InvalidTransition):
        await QueueService(db).change_queue_status(
            tenant_id, seeded["queue"]["id"], "resume", "actor"
        )


# ------------------------------------------------------- serving lifecycle
async def test_full_serving_lifecycle(db, tenant_id, seeded):
    service = QueueService(db)
    queue_id = seeded["queue"]["id"]
    await service.issue_token(tenant_id, queue_id, customer_name="First")

    called = await service.call_next(tenant_id, queue_id, "operator")
    assert called["status"] == TokenStatus.CALLED.value

    serving = await service.start_serving(tenant_id, called["id"], "operator")
    assert serving["status"] == TokenStatus.SERVING.value

    done = await service.complete(tenant_id, called["id"], "operator")
    assert done["status"] == TokenStatus.COMPLETED.value


async def test_call_next_on_empty_queue_raises(db, tenant_id, seeded):
    with pytest.raises(NotFound):
        await QueueService(db).call_next(tenant_id, seeded["queue"]["id"], "operator")


async def test_priority_tokens_are_served_first(db, tenant_id, seeded):
    service = QueueService(db)
    queue_id = seeded["queue"]["id"]

    await service.issue_token(tenant_id, queue_id, customer_name="Normal")
    await service.issue_token(
        tenant_id, queue_id, customer_name="Urgent", priority=TokenPriority.EMERGENCY
    )

    first = await service.call_next(tenant_id, queue_id, "operator")
    assert first["customer_name"] == "Urgent", "emergency token should jump the line"


async def test_double_complete_is_rejected(db, tenant_id, seeded):
    """The guard prevents a second operator acting on a finished token."""
    service = QueueService(db)
    queue_id = seeded["queue"]["id"]
    await service.issue_token(tenant_id, queue_id, customer_name="First")
    called = await service.call_next(tenant_id, queue_id, "operator")
    await service.complete(tenant_id, called["id"], "operator")

    with pytest.raises(InvalidTransition):
        await service.complete(tenant_id, called["id"], "other-operator")


async def test_cannot_serve_a_waiting_token_directly(db, tenant_id, seeded):
    service = QueueService(db)
    token = await service.issue_token(
        tenant_id, seeded["queue"]["id"], customer_name="Guest"
    )
    with pytest.raises(InvalidTransition):
        await service.start_serving(tenant_id, token["id"], "operator")


async def test_skipped_token_can_be_requeued(db, tenant_id, seeded):
    service = QueueService(db)
    token = await service.issue_token(
        tenant_id, seeded["queue"]["id"], customer_name="Guest"
    )
    skipped = await service.skip(tenant_id, token["id"], "operator")
    assert skipped["status"] == TokenStatus.SKIPPED.value

    back = await service.requeue(tenant_id, token["id"], "operator")
    assert back["status"] == TokenStatus.WAITING.value


# -------------------------------------------------------------- ETA + view
async def test_eta_falls_back_to_service_duration(db, tenant_id, seeded):
    """With no completion history, ETA uses the configured duration."""
    service = QueueService(db)
    avg = await service.average_service_seconds(
        tenant_id, seeded["service"]["id"], seeded["provider"]["id"]
    )
    assert avg == 600.0  # 10 minutes


async def test_position_and_eta_increase_down_the_line(db, tenant_id, seeded):
    service = QueueService(db)
    queue_id = seeded["queue"]["id"]

    first = await service.issue_token(tenant_id, queue_id, customer_name="A")
    second = await service.issue_token(tenant_id, queue_id, customer_name="B")
    third = await service.issue_token(tenant_id, queue_id, customer_name="C")

    assert first["position"] == 1 and first["people_ahead"] == 0
    assert second["position"] == 2
    assert third["position"] == 3
    # 2 people ahead x 10 minutes.
    assert third["estimated_wait_minutes"] == 20.0


async def test_live_monitor_reports_accurate_counts(db, tenant_id, seeded):
    service = QueueService(db)
    queue_id = seeded["queue"]["id"]
    for name in ("A", "B", "C"):
        await service.issue_token(tenant_id, queue_id, customer_name=name)

    called = await service.call_next(tenant_id, queue_id, "operator")
    await service.complete(tenant_id, called["id"], "operator")

    monitor = await service.live_monitor(tenant_id, queue_id)
    assert monitor["waiting_count"] == 2
    assert monitor["completed_count"] == 1
    assert monitor["next_token"] is not None
    assert monitor["status"] == "open"
