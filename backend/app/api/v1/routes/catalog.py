"""Vendor catalog CRUD: branches, providers and services (plan-limit aware)."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.deps import get_current_staff, get_db, get_tenant_id, require_permission
from app.core.errors import NotFound
from app.core.permissions import Action, VendorModule
from app.repositories.catalog import BranchRepository, ProviderRepository, ServiceRepository
from app.schemas.common import PaginationParams, ok, pagination_params, paginate
from app.schemas.tenant import (
    BranchCreate,
    BranchUpdate,
    ProviderCreate,
    ProviderUpdate,
    ServiceCreate,
    ServiceUpdate,
)
from app.services.plan_service import PlanService

router = APIRouter(prefix="/vendor", tags=["catalog"])


# ------------------------------------------------------------- branches
@router.get("/branches")
async def list_branches(
    params: PaginationParams = Depends(pagination_params),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(VendorModule.BRANCHES.value, Action.VIEW)),
) -> Dict[str, Any]:
    items, total = await BranchRepository(db).list(params, tenant_id)
    return paginate(items, total, params)


@router.post("/branches", status_code=status.HTTP_201_CREATED)
async def create_branch(
    payload: BranchCreate,
    staff: Dict[str, Any] = Depends(get_current_staff),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(VendorModule.BRANCHES.value, Action.CREATE)),
) -> Dict[str, Any]:
    await PlanService(db).enforce_limit(tenant_id, "max_branches", "branches")

    data = payload.model_dump()
    lat, lng = data.pop("latitude", None), data.pop("longitude", None)
    if lat is not None and lng is not None:
        # GeoJSON is [longitude, latitude] - the reverse of the usual order.
        data["location"] = {"type": "Point", "coordinates": [lng, lat]}
    branch = await BranchRepository(db).create(data, tenant_id, staff["id"])
    return ok(branch)


@router.patch("/branches/{branch_id}")
async def update_branch(
    branch_id: str,
    payload: BranchUpdate,
    staff: Dict[str, Any] = Depends(get_current_staff),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(VendorModule.BRANCHES.value, Action.UPDATE)),
) -> Dict[str, Any]:
    data = payload.model_dump(exclude_none=True)
    lat, lng = data.pop("latitude", None), data.pop("longitude", None)
    if lat is not None and lng is not None:
        data["location"] = {"type": "Point", "coordinates": [lng, lat]}
    updated = await BranchRepository(db).update(branch_id, data, tenant_id, staff["id"])
    if not updated:
        raise NotFound("Branch not found.")
    return ok(updated)


@router.delete("/branches/{branch_id}")
async def delete_branch(
    branch_id: str,
    staff: Dict[str, Any] = Depends(get_current_staff),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(VendorModule.BRANCHES.value, Action.DELETE)),
) -> Dict[str, Any]:
    if not await BranchRepository(db).soft_delete_by_id(branch_id, tenant_id, staff["id"]):
        raise NotFound("Branch not found.")
    return ok({"deleted": True})


# ------------------------------------------------------------ providers
@router.get("/providers")
async def list_providers(
    params: PaginationParams = Depends(pagination_params),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(VendorModule.PROVIDERS.value, Action.VIEW)),
) -> Dict[str, Any]:
    items, total = await ProviderRepository(db).list(params, tenant_id)
    return paginate(items, total, params)


@router.post("/providers", status_code=status.HTTP_201_CREATED)
async def create_provider(
    payload: ProviderCreate,
    staff: Dict[str, Any] = Depends(get_current_staff),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(VendorModule.PROVIDERS.value, Action.CREATE)),
) -> Dict[str, Any]:
    await PlanService(db).enforce_limit(tenant_id, "max_providers", "providers")
    data = payload.model_dump(mode="json")
    data["status"] = "active"
    provider = await ProviderRepository(db).create(data, tenant_id, staff["id"])
    return ok(provider)


@router.patch("/providers/{provider_id}")
async def update_provider(
    provider_id: str,
    payload: ProviderUpdate,
    staff: Dict[str, Any] = Depends(get_current_staff),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(VendorModule.PROVIDERS.value, Action.UPDATE)),
) -> Dict[str, Any]:
    updated = await ProviderRepository(db).update(
        provider_id, payload.model_dump(mode="json", exclude_none=True), tenant_id, staff["id"]
    )
    if not updated:
        raise NotFound("Provider not found.")
    return ok(updated)


@router.delete("/providers/{provider_id}")
async def delete_provider(
    provider_id: str,
    staff: Dict[str, Any] = Depends(get_current_staff),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(VendorModule.PROVIDERS.value, Action.DELETE)),
) -> Dict[str, Any]:
    if not await ProviderRepository(db).soft_delete_by_id(provider_id, tenant_id, staff["id"]):
        raise NotFound("Provider not found.")
    return ok({"deleted": True})


# ------------------------------------------------------------- services
@router.get("/services")
async def list_services(
    params: PaginationParams = Depends(pagination_params),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(VendorModule.SERVICES.value, Action.VIEW)),
) -> Dict[str, Any]:
    items, total = await ServiceRepository(db).list(params, tenant_id)
    return paginate(items, total, params)


@router.post("/services", status_code=status.HTTP_201_CREATED)
async def create_service(
    payload: ServiceCreate,
    staff: Dict[str, Any] = Depends(get_current_staff),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(VendorModule.SERVICES.value, Action.CREATE)),
) -> Dict[str, Any]:
    await PlanService(db).enforce_limit(tenant_id, "max_services", "services")
    service = await ServiceRepository(db).create(
        payload.model_dump(mode="json"), tenant_id, staff["id"]
    )
    return ok(service)


@router.patch("/services/{service_id}")
async def update_service(
    service_id: str,
    payload: ServiceUpdate,
    staff: Dict[str, Any] = Depends(get_current_staff),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(VendorModule.SERVICES.value, Action.UPDATE)),
) -> Dict[str, Any]:
    updated = await ServiceRepository(db).update(
        service_id, payload.model_dump(mode="json", exclude_none=True), tenant_id, staff["id"]
    )
    if not updated:
        raise NotFound("Service not found.")
    return ok(updated)


@router.delete("/services/{service_id}")
async def delete_service(
    service_id: str,
    staff: Dict[str, Any] = Depends(get_current_staff),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_permission(VendorModule.SERVICES.value, Action.DELETE)),
) -> Dict[str, Any]:
    if not await ServiceRepository(db).soft_delete_by_id(service_id, tenant_id, staff["id"]):
        raise NotFound("Service not found.")
    return ok({"deleted": True})
