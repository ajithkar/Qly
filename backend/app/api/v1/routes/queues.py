"""Vendor queue management and the Live Operator Console.

Route ordering matters here: the generic `/{queue_id}/{action}` and
`/tokens/{token_id}/{action}` handlers are registered LAST, because FastAPI
matches in registration order and a catch-all declared earlier would swallow
the specific routes below it.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.deps import client_ip, get_current_staff, get_db, get_tenant_id, require_permission
from app.core.errors import NotFound, PermissionDenied, ValidationError
from app.core.permissions import Action, VendorModule
from app.repositories.queues import QueueRepository, TokenRepository
from app.schemas.common import PaginationParams, ok, pagination_params, paginate
from app.schemas.queue import (
    QueueCreate,
    QueueLifecycleRequest,
    TransferTokenRequest,
    WalkInTokenRequest,
)
from app.services.audit_service import AuditService
from app.services.queue_service import QueueService

router = APIRouter(prefix="/vendor/queues", tags=["queues"])

_view = require_permission(VendorModule.QUEUES.value, Action.VIEW)
_create = require_permission(VendorModule.QUEUES.value, Action.CREATE)
_update = require_permission(VendorModule.QUEUES.value, Action.UPDATE)

QUEUE_ACTIONS = {"start", "pause", "resume", "close"}
TOKEN_ACTIONS = {"recall", "serve", "complete", "skip", "no-show", "cancel", "requeue"}

OPERATOR_OVERRIDE_ROLES = {"owner", "manager"}


async def _authorize_operator(
    tenant_id: str, queue_id: str, staff: Dict[str, Any], db: AsyncIOMotorDatabase
) -> Dict[str, Any]:
    """The Operator Console is further restricted, beyond queues:update, to
    the doctor assigned to THIS queue - owners and managers keep override
    access so they can step in when a doctor is unavailable."""
    queue = await QueueRepository(db).get_by_id(queue_id, tenant_id)
    if not queue:
        raise NotFound("Queue not found.")
    role = staff.get("role")
    if role in OPERATOR_OVERRIDE_ROLES:
        return queue
    if role == "provider" and staff.get("provider_id") and staff["provider_id"] == queue.get("provider_id"):
        return queue
    raise PermissionDenied("Only the doctor assigned to this queue can operate it.")


# --------------------------------------------------------------- listings
@router.get("")
async def list_queues(
    params: PaginationParams = Depends(pagination_params),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(_view),
) -> Dict[str, Any]:
    items, total = await QueueRepository(db).list(params, tenant_id)
    return paginate(items, total, params)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_queue(
    payload: QueueCreate,
    staff: Dict[str, Any] = Depends(get_current_staff),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(_create),
) -> Dict[str, Any]:
    return ok(await QueueService(db).create_queue(tenant_id, payload.model_dump(), staff["id"]))


# ------------------------------------------------- specific token actions
# Declared before the generic handlers so they are matched first.
@router.post("/tokens/{token_id}/transfer")
async def transfer_token(
    token_id: str,
    payload: TransferTokenRequest,
    staff: Dict[str, Any] = Depends(get_current_staff),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(_update),
) -> Dict[str, Any]:
    return ok(
        await QueueService(db).transfer(
            tenant_id, token_id, payload.target_queue_id, staff["id"]
        )
    )


# ------------------------------------------------- specific queue actions
@router.post("/{queue_id}/call-next")
async def call_next(
    queue_id: str,
    staff: Dict[str, Any] = Depends(get_current_staff),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(_update),
) -> Dict[str, Any]:
    await _authorize_operator(tenant_id, queue_id, staff, db)
    return ok(await QueueService(db).call_next(tenant_id, queue_id, staff["id"]))


@router.post("/{queue_id}/tokens/walk-in", status_code=status.HTTP_201_CREATED)
async def generate_walk_in_token(
    queue_id: str,
    payload: WalkInTokenRequest,
    staff: Dict[str, Any] = Depends(get_current_staff),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(_create),
) -> Dict[str, Any]:
    await _authorize_operator(tenant_id, queue_id, staff, db)
    return ok(
        await QueueService(db).issue_token(
            tenant_id,
            queue_id,
            customer_name=payload.customer_name,
            customer_phone=payload.customer_phone,
            priority=payload.priority,
            actor_id=staff["id"],
        )
    )


@router.post("/{queue_id}/console/share", status_code=status.HTTP_201_CREATED)
async def share_console_access(
    queue_id: str,
    staff: Dict[str, Any] = Depends(get_current_staff),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(_update),
) -> Dict[str, Any]:
    """Generate a one-time code to hand the assigned doctor - granting console
    access is an owner/manager decision, same as who gets to be that doctor."""
    if staff.get("role") not in OPERATOR_OVERRIDE_ROLES:
        raise PermissionDenied("Only an owner or manager can share console access.")
    return ok(await QueueService(db).create_console_share(tenant_id, queue_id, staff["id"]))


@router.get("/{queue_id}/monitor")
async def live_monitor(
    queue_id: str,
    staff: Dict[str, Any] = Depends(get_current_staff),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(_view),
) -> Dict[str, Any]:
    await _authorize_operator(tenant_id, queue_id, staff, db)
    return ok(await QueueService(db).live_monitor(tenant_id, queue_id))


@router.get("/{queue_id}/tokens")
async def list_tokens(
    queue_id: str,
    params: PaginationParams = Depends(pagination_params),
    staff: Dict[str, Any] = Depends(get_current_staff),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(_view),
) -> Dict[str, Any]:
    await _authorize_operator(tenant_id, queue_id, staff, db)
    items, total = await TokenRepository(db).list(params, tenant_id, {"queue_id": queue_id})
    return paginate(items, total, params)


@router.get("/{queue_id}")
async def get_queue(
    queue_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(_view),
) -> Dict[str, Any]:
    queue = await QueueRepository(db).get_by_id(queue_id, tenant_id)
    if not queue:
        raise NotFound("Queue not found.")
    return ok(queue)


# ------------------------------------------------------- generic handlers
# These MUST stay last - see the module docstring.
@router.post("/tokens/{token_id}/{action}")
async def token_action(
    token_id: str,
    action: str,
    staff: Dict[str, Any] = Depends(get_current_staff),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(_update),
) -> Dict[str, Any]:
    """recall | serve | complete | skip | no-show | cancel | requeue"""
    if action not in TOKEN_ACTIONS:
        raise ValidationError(
            f"Unknown token action '{action}'.",
            details=[{"field": "action", "message": f"Allowed: {sorted(TOKEN_ACTIONS)}"}],
        )
    token = await TokenRepository(db).get_by_id(token_id, tenant_id)
    if not token:
        raise NotFound("Token not found.")
    await _authorize_operator(tenant_id, token["queue_id"], staff, db)
    service = QueueService(db)
    handlers = {
        "recall": service.recall,
        "serve": service.start_serving,
        "complete": service.complete,
        "skip": service.skip,
        "no-show": service.mark_no_show,
        "cancel": service.cancel,
        "requeue": service.requeue,
    }
    return ok(await handlers[action](tenant_id, token_id, staff["id"]))


@router.post("/{queue_id}/{action}")
async def queue_lifecycle(
    queue_id: str,
    action: str,
    request: Request,
    payload: Optional[QueueLifecycleRequest] = None,
    staff: Dict[str, Any] = Depends(get_current_staff),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(_update),
) -> Dict[str, Any]:
    """start | pause | resume | close

    `start` assigns the doctor for this queue (via `provider_id` in the body)
    and is intentionally NOT restricted to that doctor - a receptionist or
    manager is who typically starts the queue and hands it to a provider.
    Every other transition (pause/resume/close) is the console's own action
    and is restricted to the assigned doctor (or an owner/manager override).
    """
    if action not in QUEUE_ACTIONS:
        raise ValidationError(
            f"Unknown queue action '{action}'.",
            details=[{"field": "action", "message": f"Allowed: {sorted(QUEUE_ACTIONS)}"}],
        )
    if action != "start":
        await _authorize_operator(tenant_id, queue_id, staff, db)
    provider_id = payload.provider_id if payload else None
    queue = await QueueService(db).change_queue_status(
        tenant_id, queue_id, action, staff["id"], provider_id=provider_id
    )
    await AuditService(db).record(
        tenant_id=tenant_id,
        actor_id=staff["id"],
        actor_email=staff.get("email"),
        action=f"queue_{action}",
        module="queues",
        resource_id=queue_id,
        ip=client_ip(request),
    )
    return ok(queue)
