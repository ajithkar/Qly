"""Appointment scheduling: slot discovery, booking, reschedule, check-in."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.deps import (
    get_current_staff,
    get_current_user,
    get_db,
    get_tenant_id,
    require_permission,
)
from app.core.errors import NotFound, PermissionDenied
from app.core.permissions import Action, VendorModule
from app.repositories.catalog import AppointmentRepository
from app.schemas.appointment import (
    AppointmentCreate,
    AppointmentReschedule,
    AppointmentStatusUpdate,
)
from app.schemas.common import PaginationParams, ok, pagination_params, paginate
from app.services.appointment_service import AppointmentService

router = APIRouter(tags=["appointments"])


# ------------------------------------------------------- public / end user
@router.get("/services/{service_id}/slots")
async def available_slots(
    service_id: str,
    tenant_id: str = Query(...),
    provider_id: str = Query(...),
    date: str = Query(..., description="YYYY-MM-DD in the branch timezone"),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    return ok(
        await AppointmentService(db).available_slots(tenant_id, service_id, provider_id, date)
    )


@router.post("/appointments", status_code=status.HTTP_201_CREATED)
async def book_appointment(
    payload: AppointmentCreate,
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    data = payload.model_dump()
    tenant_id = data.pop("tenant_id")
    appointment = await AppointmentService(db).book(tenant_id, data, user_id=user["id"])
    return ok(appointment)


@router.get("/me/appointments")
async def my_appointments(
    params: PaginationParams = Depends(pagination_params),
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    repo = AppointmentRepository(db)
    query = {"user_id": user["id"], "is_deleted": False}
    total = await repo.collection.count_documents(query)
    cursor = (
        repo.collection.find(query)
        .sort("slot_start", -1)
        .skip(params.skip)
        .limit(params.page_size)
    )
    from app.models.base import serialize

    items = [serialize(d) for d in await cursor.to_list(length=params.page_size)]
    return paginate(items, total, params)


@router.patch("/me/appointments/{appointment_id}/reschedule")
async def user_reschedule(
    appointment_id: str,
    payload: AppointmentReschedule,
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    service = AppointmentService(db)
    existing = await _owned_appointment(db, appointment_id, user["id"])
    updated = await service.reschedule(
        existing["tenant_id"], appointment_id, payload.slot_start, user["id"]
    )
    return ok(updated)


@router.post("/me/appointments/{appointment_id}/cancel")
async def user_cancel(
    appointment_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    existing = await _owned_appointment(db, appointment_id, user["id"])
    updated = await AppointmentService(db).cancel(
        existing["tenant_id"], appointment_id, user["id"], reason="Cancelled by customer"
    )
    return ok(updated)


async def _owned_appointment(db, appointment_id: str, user_id: str) -> dict:
    from app.models.base import serialize, to_object_id

    doc = await db["appointments"].find_one({"_id": to_object_id(appointment_id)})
    if not doc:
        raise NotFound("Appointment not found.")
    appointment = serialize(doc)
    if appointment.get("user_id") != user_id:
        raise PermissionDenied("That appointment belongs to someone else.")
    return appointment


# ------------------------------------------------------------- vendor side
@router.get("/vendor/appointments")
async def list_appointments(
    params: PaginationParams = Depends(pagination_params),
    status_filter: str | None = Query(None, alias="status"),
    business_day: str | None = Query(None),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(VendorModule.APPOINTMENTS.value, Action.VIEW)),
) -> Dict[str, Any]:
    filters: Dict[str, Any] = {}
    if status_filter:
        filters["status"] = status_filter
    if business_day:
        filters["business_day"] = business_day
    items, total = await AppointmentRepository(db).list(params, tenant_id, filters)
    return paginate(items, total, params)


@router.post("/vendor/appointments", status_code=status.HTTP_201_CREATED)
async def create_appointment(
    payload: AppointmentCreate,
    staff: Dict[str, Any] = Depends(get_current_staff),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(VendorModule.APPOINTMENTS.value, Action.CREATE)),
) -> Dict[str, Any]:
    data = payload.model_dump()
    data.pop("tenant_id", None)
    return ok(await AppointmentService(db).book(tenant_id, data, actor_id=staff["id"]))


@router.patch("/vendor/appointments/{appointment_id}/status")
async def change_status(
    appointment_id: str,
    payload: AppointmentStatusUpdate,
    staff: Dict[str, Any] = Depends(get_current_staff),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(VendorModule.APPOINTMENTS.value, Action.UPDATE)),
) -> Dict[str, Any]:
    from app.models.enums import AppointmentStatus

    service = AppointmentService(db)
    if payload.status == AppointmentStatus.CANCELLED:
        return ok(await service.cancel(tenant_id, appointment_id, staff["id"], payload.reason))

    updated = await AppointmentRepository(db).guarded_status_change(
        appointment_id,
        tenant_id,
        expected=[
            AppointmentStatus.BOOKED.value,
            AppointmentStatus.CONFIRMED.value,
            AppointmentStatus.CHECKED_IN.value,
        ],
        target=payload.status.value,
        extra_set={"status_reason": payload.reason},
        actor_id=staff["id"],
    )
    if not updated:
        raise NotFound("Appointment not found, or its status has already changed.")
    return ok(updated)


@router.post("/vendor/appointments/{appointment_id}/check-in")
async def check_in(
    appointment_id: str,
    staff: Dict[str, Any] = Depends(get_current_staff),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(VendorModule.APPOINTMENTS.value, Action.UPDATE)),
) -> Dict[str, Any]:
    """Convert an appointment into a live queue token."""
    return ok(await AppointmentService(db).check_in(tenant_id, appointment_id, staff["id"]))
