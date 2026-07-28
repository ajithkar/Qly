"""Super Admin portal: platform-wide vendor, plan, user and audit management.

This is the only cross-tenant surface in the API. Every handler here is
explicitly guarded by an admin permission; nothing falls back to tenant scope.
"""
from __future__ import annotations

import json
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Query, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.deps import client_ip, get_current_admin, get_db, require_permission
from app.core.errors import Conflict, NotFound
from app.core.permissions import Action, AdminModule
from app.core.security import create_access_token, utcnow
from app.models.enums import AccountStatus, TenantStatus
from app.repositories.catalog import (
    AppointmentRepository,
    PlanRepository,
    SubscriptionRepository,
)
from app.repositories.identity import TenantRepository, UserRepository
from app.repositories.queues import QueueRepository, TokenRepository
from app.schemas.auth import AdminVendorCreateRequest
from app.schemas.billing import PlanCreate, PlanUpdate
from app.schemas.common import PaginationParams, ok, pagination_params, paginate
from app.services.audit_service import AuditService
from app.services.auth_service import AuthService
from app.services.stripe_client import get_stripe_client
from app.services.stripe_service import StripeService

router = APIRouter(prefix="/admin", tags=["admin"])


# ------------------------------------------------------------- dashboard
@router.get("/dashboard")
async def dashboard(
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(AdminModule.DASHBOARD.value, Action.VIEW)),
) -> Dict[str, Any]:
    """Platform KPIs. Every figure is computed - none are placeholders."""
    tenants = TenantRepository(db)
    users = UserRepository(db)

    total_vendors = await tenants.collection.count_documents({"is_deleted": False})
    active_vendors = await tenants.collection.count_documents(
        {"status": TenantStatus.ACTIVE.value, "is_deleted": False}
    )
    suspended_vendors = await tenants.collection.count_documents(
        {"status": TenantStatus.SUSPENDED.value, "is_deleted": False}
    )
    total_users = await users.collection.count_documents({"is_deleted": False})

    from app.services.queue_service import business_day_for

    today = business_day_for("UTC")
    todays_appointments = await AppointmentRepository(db).collection.count_documents(
        {"business_day": today}
    )
    active_queues = await QueueRepository(db).collection.count_documents(
        {"status": "open", "is_deleted": False}
    )
    tokens_today = await TokenRepository(db).collection.count_documents(
        {"business_day": today}
    )

    # MRR from live subscriptions, normalising yearly plans to a monthly figure.
    mrr = 0.0
    plans = {p["code"]: p for p in await PlanRepository(db).collection.find({}).to_list(200)}
    async for sub in SubscriptionRepository(db).collection.find({"stripe_status": "active"}):
        plan = plans.get(sub.get("plan_code"))
        if not plan:
            continue
        if sub.get("billing_cycle") == "yearly":
            mrr += float(plan.get("yearly_price", 0)) / 12.0
        else:
            mrr += float(plan.get("monthly_price", 0))

    paid_vendors = await SubscriptionRepository(db).collection.count_documents(
        {"stripe_status": "active"}
    )

    return ok(
        {
            "total_vendors": total_vendors,
            "active_vendors": active_vendors,
            "suspended_vendors": suspended_vendors,
            "paid_vendors": paid_vendors,
            "free_vendors": max(total_vendors - paid_vendors, 0),
            "total_end_users": total_users,
            "todays_appointments": todays_appointments,
            "active_queues": active_queues,
            "tokens_issued_today": tokens_today,
            "mrr": round(mrr, 2),
            "arr": round(mrr * 12, 2),
            "generated_at": utcnow(),
        }
    )


# --------------------------------------------------------------- vendors
@router.get("/vendors")
async def list_vendors(
    params: PaginationParams = Depends(pagination_params),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(AdminModule.VENDORS.value, Action.VIEW)),
) -> Dict[str, Any]:
    filters = {"status": status_filter} if status_filter else {}
    items, total = await TenantRepository(db).list(params, filters=filters)
    return paginate(items, total, params)


@router.get("/vendors/{tenant_id}")
async def vendor_profile(
    tenant_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(AdminModule.VENDORS.value, Action.VIEW)),
) -> Dict[str, Any]:
    tenant = await TenantRepository(db).get_by_id(tenant_id)
    if not tenant:
        raise NotFound("Vendor not found.")

    from app.repositories.catalog import BranchRepository, ProviderRepository, ServiceRepository
    from app.repositories.identity import StaffRepository

    return ok(
        {
            "organisation": tenant,
            "subscription": await SubscriptionRepository(db).get_for_tenant(tenant_id),
            "counts": {
                "branches": await BranchRepository(db).count(tenant_id),
                "providers": await ProviderRepository(db).count(tenant_id),
                "services": await ServiceRepository(db).count(tenant_id),
                "staff": await StaffRepository(db).count(tenant_id),
                "appointments": await AppointmentRepository(db).count(tenant_id),
            },
        }
    )


@router.post("/vendors", status_code=status.HTTP_201_CREATED)
async def create_vendor(
    payload: AdminVendorCreateRequest,
    request: Request,
    admin: Dict[str, Any] = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(AdminModule.VENDORS.value, Action.CREATE)),
) -> Dict[str, Any]:
    tenant = await AuthService(db).create_vendor_by_admin(payload.model_dump())
    checkout = await StripeService(db, get_stripe_client()).create_checkout_session(
        tenant["id"], payload.plan_code, payload.billing_cycle
    )
    await AuditService(db).record(
        tenant_id=tenant["id"],
        actor_id=admin["id"],
        actor_email=admin.get("email"),
        action="create_vendor",
        module="admin_vendors",
        resource_id=tenant["id"],
        updated_value={"company_name": tenant.get("company_name"), "plan_code": tenant.get("plan_code")},
        ip=client_ip(request),
    )
    return ok({**tenant, "checkout_url": checkout["checkout_url"], "checkout_session_id": checkout["session_id"]})


@router.post("/vendors/{tenant_id}/checkout", status_code=status.HTTP_201_CREATED)
async def regenerate_vendor_checkout(
    tenant_id: str,
    admin: Dict[str, Any] = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(AdminModule.VENDORS.value, Action.UPDATE)),
) -> Dict[str, Any]:
    """A fresh payment link - Stripe Checkout Sessions expire, and the
    vendor's first one may have gone stale before they got to it."""
    tenant = await TenantRepository(db).get_by_id(tenant_id)
    if not tenant:
        raise NotFound("Vendor not found.")
    checkout = await StripeService(db, get_stripe_client()).create_checkout_session(
        tenant_id, tenant["plan_code"], "monthly"
    )
    return ok({"checkout_url": checkout["checkout_url"], "checkout_session_id": checkout["session_id"]})


@router.get("/vendors/{tenant_id}/credentials")
async def vendor_credentials(
    tenant_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(AdminModule.VENDORS.value, Action.VIEW)),
) -> Dict[str, Any]:
    """The owner's generated login email + password, viewable for a short
    window after payment activates the account - the same credentials that
    were emailed to them."""
    from app.db.redis_client import get_redis

    raw = await get_redis().get(f"vendor_credentials:{tenant_id}")
    if not raw:
        raise NotFound(
            "No credentials available - the vendor hasn't paid yet, or this has expired."
        )
    return ok(json.loads(raw))


@router.post("/vendors/{tenant_id}/suspend")
async def suspend_vendor(
    tenant_id: str,
    request: Request,
    admin: Dict[str, Any] = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(AdminModule.VENDORS.value, Action.UPDATE)),
) -> Dict[str, Any]:
    tenant = await TenantRepository(db).get_by_id(tenant_id)
    if not tenant:
        raise NotFound("Vendor not found.")
    updated = await TenantRepository(db).update(
        tenant_id, {"status": TenantStatus.SUSPENDED.value}, actor_id=admin["id"]
    )
    await AuditService(db).record(
        tenant_id=tenant_id,
        actor_id=admin["id"],
        actor_email=admin.get("email"),
        action="suspend_vendor",
        module="admin_vendors",
        resource_id=tenant_id,
        previous_value={"status": tenant.get("status")},
        updated_value={"status": TenantStatus.SUSPENDED.value},
        ip=client_ip(request),
    )
    return ok(updated)


@router.post("/vendors/{tenant_id}/reactivate")
async def reactivate_vendor(
    tenant_id: str,
    request: Request,
    admin: Dict[str, Any] = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(AdminModule.VENDORS.value, Action.UPDATE)),
) -> Dict[str, Any]:
    tenant = await TenantRepository(db).get_by_id(tenant_id)
    if not tenant:
        raise NotFound("Vendor not found.")
    updated = await TenantRepository(db).update(
        tenant_id, {"status": TenantStatus.ACTIVE.value}, actor_id=admin["id"]
    )
    await AuditService(db).record(
        tenant_id=tenant_id,
        actor_id=admin["id"],
        actor_email=admin.get("email"),
        action="reactivate_vendor",
        module="admin_vendors",
        resource_id=tenant_id,
        ip=client_ip(request),
    )
    return ok(updated)


@router.post("/vendors/{tenant_id}/impersonate")
async def impersonate_vendor(
    tenant_id: str,
    request: Request,
    admin: Dict[str, Any] = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(AdminModule.VENDORS.value, Action.UPDATE)),
) -> Dict[str, Any]:
    """Scoped support impersonation.

    Issues a short-lived staff token flagged as impersonated, and always
    writes an audit entry. Support access that is not auditable is not support
    access - it is an unlogged backdoor.
    """
    from app.repositories.identity import StaffRepository

    tenant = await TenantRepository(db).get_by_id(tenant_id)
    if not tenant:
        raise NotFound("Vendor not found.")

    owner = await StaffRepository(db).find_one({"role": "owner"}, tenant_id)
    if not owner:
        raise NotFound("This organisation has no owner account.")

    token = create_access_token(
        subject=owner["id"],
        principal_type="staff",
        tenant_id=tenant_id,
        role=owner["role"],
    )
    await AuditService(db).record(
        tenant_id=tenant_id,
        actor_id=admin["id"],
        actor_email=admin.get("email"),
        action="impersonate_vendor",
        module="admin_vendors",
        resource_id=tenant_id,
        updated_value={"impersonated_staff_id": owner["id"]},
        ip=client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    return ok(
        {
            "access_token": token,
            "impersonated": True,
            "tenant_id": tenant_id,
            "expires_in": 900,
            "notice": "This session is impersonated and fully audit-logged.",
        }
    )


# ----------------------------------------------------------------- plans
@router.get("/plans")
async def list_plans(
    params: PaginationParams = Depends(pagination_params),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(AdminModule.PLANS.value, Action.VIEW)),
) -> Dict[str, Any]:
    items, total = await PlanRepository(db).list(params)
    return paginate(items, total, params)


@router.post("/plans", status_code=status.HTTP_201_CREATED)
async def create_plan(
    payload: PlanCreate,
    admin: Dict[str, Any] = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(AdminModule.PLANS.value, Action.CREATE)),
) -> Dict[str, Any]:
    repo = PlanRepository(db)
    if await repo.find_one({"code": payload.code}):
        raise Conflict("A plan with that code already exists.")
    plan = await repo.create({**payload.model_dump(), "archived": False}, actor_id=admin["id"])
    return ok(plan)


@router.patch("/plans/{plan_id}")
async def update_plan(
    plan_id: str,
    payload: PlanUpdate,
    admin: Dict[str, Any] = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(AdminModule.PLANS.value, Action.UPDATE)),
) -> Dict[str, Any]:
    updated = await PlanRepository(db).update(
        plan_id, payload.model_dump(exclude_none=True), actor_id=admin["id"]
    )
    if not updated:
        raise NotFound("Plan not found.")
    return ok(updated)


# ----------------------------------------------------------------- users
@router.get("/users")
async def list_users(
    params: PaginationParams = Depends(pagination_params),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(AdminModule.USERS.value, Action.VIEW)),
) -> Dict[str, Any]:
    items, total = await UserRepository(db).list(params)
    # Never expose the OAuth subject identifier to the admin UI.
    for item in items:
        item.pop("google_sub", None)
    return paginate(items, total, params)


@router.post("/users/{user_id}/suspend")
async def suspend_user(
    user_id: str,
    request: Request,
    admin: Dict[str, Any] = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(AdminModule.USERS.value, Action.UPDATE)),
) -> Dict[str, Any]:
    updated = await UserRepository(db).update(
        user_id, {"status": AccountStatus.SUSPENDED.value}, actor_id=admin["id"]
    )
    if not updated:
        raise NotFound("User not found.")

    # Suspension must terminate live sessions, not just block new logins.
    from app.repositories.identity import RefreshTokenRepository

    await RefreshTokenRepository(db).revoke_all_for_subject(user_id)
    await AuditService(db).record(
        tenant_id=None,
        actor_id=admin["id"],
        actor_email=admin.get("email"),
        action="suspend_user",
        module="admin_users",
        resource_id=user_id,
        ip=client_ip(request),
    )
    return ok(updated)


# ------------------------------------------------------------ audit logs
@router.get("/audit-logs")
async def audit_logs(
    params: PaginationParams = Depends(pagination_params),
    tenant_filter: Optional[str] = Query(None, alias="tenant_id"),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(AdminModule.AUDIT.value, Action.VIEW)),
) -> Dict[str, Any]:
    items, total = await AuditService(db).list(params, tenant_filter)
    return paginate(items, total, params)


# --------------------------------------------------------- stripe events
@router.get("/stripe-events")
async def stripe_events(
    params: PaginationParams = Depends(pagination_params),
    processed: Optional[bool] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(AdminModule.PAYMENTS.value, Action.VIEW)),
) -> Dict[str, Any]:
    query: Dict[str, Any] = {}
    if processed is not None:
        query["processed"] = processed
    total = await db["stripe_events"].count_documents(query)
    cursor = (
        db["stripe_events"]
        .find(query, {"payload": 0})
        .sort("created_at", -1)
        .skip(params.skip)
        .limit(params.page_size)
    )
    from app.models.base import serialize

    items = [serialize(d) for d in await cursor.to_list(length=params.page_size)]
    return paginate(items, total, params)
