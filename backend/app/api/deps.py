"""FastAPI dependencies: authentication, tenant scoping, permission guards.

The tenant is always derived from the authenticated principal, never from a
client-supplied body or query value. That is what makes cross-tenant access
impossible rather than merely discouraged.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.errors import AuthenticationError, PermissionDenied
from app.core.permissions import Action, resolve_permissions
from app.core.security import decode_token
from app.db.mongo import get_database
from app.models.enums import AccountStatus, PrincipalType
from app.repositories.identity import AdminRepository, StaffRepository, UserRepository

bearer_scheme = HTTPBearer(auto_error=False)


def get_db() -> AsyncIOMotorDatabase:
    return get_database()


async def get_current_principal(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Resolve the caller from the bearer token and re-load them from the DB.

    Reloading on every request means a suspension or role change takes effect
    immediately, instead of lingering until the access token expires.
    """
    if credentials is None or not credentials.credentials:
        raise AuthenticationError("Authentication credentials were not provided.")

    payload = decode_token(credentials.credentials, expected_type="access")
    subject = payload.get("sub")
    principal_type = payload.get("principal_type")
    if not subject or not principal_type:
        raise AuthenticationError("Token payload is malformed.")

    if principal_type == PrincipalType.STAFF.value:
        # Not get_by_id: that is tenant-scoped, and the tenant is exactly what
        # we are still resolving. See StaffRepository.get_by_id_any_tenant.
        record = await StaffRepository(db).get_by_id_any_tenant(subject)
    elif principal_type == PrincipalType.ADMIN.value:
        record = await AdminRepository(db).get_by_id(subject)
    elif principal_type == PrincipalType.USER.value:
        record = await UserRepository(db).get_by_id(subject)
    else:
        raise AuthenticationError("Unknown principal type.")

    if not record:
        raise AuthenticationError("Account no longer exists.")
    if record.get("status") == AccountStatus.SUSPENDED.value:
        raise AuthenticationError("This account is suspended.", code="account_suspended")

    record["principal_type"] = principal_type
    return record


async def get_current_user(
    principal: Dict[str, Any] = Depends(get_current_principal),
) -> Dict[str, Any]:
    """End-user-only endpoints."""
    if principal["principal_type"] != PrincipalType.USER.value:
        raise PermissionDenied("This endpoint is for end users.")
    return principal


async def get_current_staff(
    principal: Dict[str, Any] = Depends(get_current_principal),
) -> Dict[str, Any]:
    """Vendor-portal endpoints."""
    if principal["principal_type"] != PrincipalType.STAFF.value:
        raise PermissionDenied("This endpoint is for vendor accounts.")
    return principal


async def get_current_admin(
    principal: Dict[str, Any] = Depends(get_current_principal),
) -> Dict[str, Any]:
    """Platform-administration endpoints."""
    if principal["principal_type"] != PrincipalType.ADMIN.value:
        raise PermissionDenied("This endpoint is for platform administrators.")
    return principal


async def get_tenant_id(staff: Dict[str, Any] = Depends(get_current_staff)) -> str:
    """The single source of tenant scoping for vendor endpoints."""
    tenant_id = staff.get("tenant_id")
    if not tenant_id:
        raise PermissionDenied("This account is not attached to an organisation.")
    return tenant_id


def require_permission(module: str, action: Action) -> Callable:
    """Guard factory: require_permission(VendorModule.QUEUES.value, Action.UPDATE)."""
    needed = f"{module}:{action.value}"

    async def _guard(
        principal: Dict[str, Any] = Depends(get_current_principal),
    ) -> Dict[str, Any]:
        granted = resolve_permissions(
            principal["principal_type"],
            principal.get("role", ""),
            principal.get("custom_permissions", []),
        )
        if needed not in granted:
            raise PermissionDenied(
                f"This action requires the '{needed}' permission."
            )
        return principal

    return _guard


def require_admin_role(*roles: str) -> Callable:
    """Guard factory: require_admin_role("super_admin").

    Narrower than require_permission - some actions must stay out of reach of
    every admin role that happens to hold the matching permission, and only
    open up to specific roles named here.
    """
    allowed = set(roles)

    async def _guard(
        admin: Dict[str, Any] = Depends(get_current_admin),
    ) -> Dict[str, Any]:
        if admin.get("role") not in allowed:
            raise PermissionDenied("This action is restricted to Super Admins.")
        return admin

    return _guard


def client_ip(request: Request) -> str:
    """Honour X-Forwarded-For because the app runs behind Nginx."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
