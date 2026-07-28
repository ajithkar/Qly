"""Public and end-user endpoints: discovery, QR/kiosk join, queue tracking."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.deps import get_current_user, get_db
from app.core.errors import Conflict, NotFound
from app.core.rate_limit import default_rate_limit
from app.models.base import serialize
from app.repositories.catalog import BranchRepository, ServiceRepository
from app.repositories.identity import TenantRepository
from app.repositories.queues import QueueRepository, TokenRepository
from app.schemas.common import PaginationParams, ok, pagination_params, paginate
from app.schemas.queue import JoinQueueRequest
from app.services.queue_service import QueueService, business_day_for

router = APIRouter(tags=["public"])


@router.get("/vendors")
async def discover_vendors(
    params: PaginationParams = Depends(pagination_params),
    latitude: Optional[float] = Query(None, ge=-90, le=90),
    longitude: Optional[float] = Query(None, ge=-180, le=180),
    radius_km: int = Query(10, ge=1, le=200),
    category: Optional[str] = Query(None, max_length=60),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: None = Depends(default_rate_limit),
) -> Dict[str, Any]:
    """Vendor discovery. Supplying coordinates switches to 'near me' search."""
    if latitude is not None and longitude is not None:
        branches = await BranchRepository(db).find_near(
            longitude, latitude, radius_km * 1000, limit=params.page_size
        )
        return ok(branches, {"mode": "geo", "radius_km": radius_km})

    filters: Dict[str, Any] = {"status": "active"}
    if category:
        filters["business_type"] = category
    items, total = await TenantRepository(db).list(params, filters=filters)
    public_fields = [
        {
            "id": t["id"],
            "company_name": t.get("company_name"),
            "slug": t.get("slug"),
            "business_type": t.get("business_type"),
            "logo_url": t.get("logo_url"),
        }
        for t in items
    ]
    return paginate(public_fields, total, params)


@router.get("/vendors/{tenant_id}")
async def vendor_profile(
    tenant_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: None = Depends(default_rate_limit),
) -> Dict[str, Any]:
    """Public vendor profile - just enough to head a booking page."""
    tenant = await TenantRepository(db).get_by_id(tenant_id)
    if not tenant or tenant.get("status") != "active":
        raise NotFound("Vendor not found.")
    return ok(
        {
            "id": tenant["id"],
            "company_name": tenant.get("company_name"),
            "slug": tenant.get("slug"),
            "business_type": tenant.get("business_type"),
            "logo_url": tenant.get("logo_url"),
        }
    )


@router.get("/vendors/{tenant_id}/branches")
async def vendor_branches(
    tenant_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: None = Depends(default_rate_limit),
) -> Dict[str, Any]:
    """Branches a customer can pick from before choosing a service."""
    docs = await BranchRepository(db).collection.find(
        {"tenant_id": tenant_id, "is_deleted": False}
    ).to_list(length=200)
    items = [serialize(doc) for doc in docs]
    return ok(
        [
            {
                "id": b["id"],
                "name": b.get("name"),
                "phone": b.get("phone"),
                "address": b.get("address"),
            }
            for b in items
        ]
    )


@router.get("/vendors/{tenant_id}/services")
async def vendor_services(
    tenant_id: str,
    branch_id: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: None = Depends(default_rate_limit),
) -> Dict[str, Any]:
    services = await ServiceRepository(db).list_for_branch(tenant_id, branch_id)
    return ok(
        [
            {
                "id": s["id"],
                "name": s.get("name"),
                "description": s.get("description"),
                "duration_minutes": s.get("duration_minutes"),
                "price": s.get("price"),
                "payment_mode": s.get("payment_mode"),
            }
            for s in services
        ]
    )


@router.post("/queues/join", status_code=status.HTTP_201_CREATED)
async def join_queue(
    payload: JoinQueueRequest,
    tenant_id: str = Query(..., description="Vendor the QR code belongs to"),
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: None = Depends(default_rate_limit),
) -> Dict[str, Any]:
    """Join a walk-in queue. This is the QR / kiosk self check-in entry point."""
    branch = await BranchRepository(db).get_by_id(payload.branch_id, tenant_id)
    if not branch:
        raise NotFound("Branch not found.")

    day = business_day_for(branch.get("timezone", "UTC"))
    queue = await QueueRepository(db).find_open_queue(
        tenant_id, payload.branch_id, payload.service_id, day
    )
    if not queue:
        raise Conflict("There is no open queue for this service right now.", code="no_open_queue")

    token = await QueueService(db).issue_token(
        tenant_id,
        queue["id"],
        customer_name=payload.customer_name or user.get("name"),
        customer_phone=payload.customer_phone,
        user_id=user["id"],
        priority=payload.priority,
    )
    return ok(token)


@router.get("/queues/{queue_id}/status")
async def queue_status(
    queue_id: str,
    tenant_id: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: None = Depends(default_rate_limit),
) -> Dict[str, Any]:
    """Public display-board view: counts and current token, no personal data."""
    monitor = await QueueService(db).live_monitor(tenant_id, queue_id)
    for key in ("current_token", "next_token"):
        if monitor.get(key):
            monitor[key] = {
                "token_number": monitor[key]["token_number"],
                "status": monitor[key]["status"],
            }
    return ok(monitor)


@router.get("/me/tokens/{token_id}")
async def my_token(
    token_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Live tracking for the token's owner, including position and ETA."""
    from app.core.errors import PermissionDenied
    from app.models.base import to_object_id, serialize

    repo = TokenRepository(db)
    doc = await repo.collection.find_one({"_id": to_object_id(token_id, "token_id")})
    if not doc:
        raise NotFound("Token not found.")

    token = serialize(doc)
    if token.get("user_id") != user["id"]:
        raise PermissionDenied("That token belongs to someone else.")
    return ok(await QueueService(db).enrich_token(token))
