"""Authentication routes for all three principal types."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.deps import (
    client_ip,
    get_current_principal,
    get_current_staff,
    get_db,
    get_tenant_id,
)
from app.core.rate_limit import auth_rate_limit, login_guard
from app.schemas.auth import (
    AcceptInviteRequest,
    AdminLoginRequest,
    EmailVerificationRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    ResetPasswordRequest,
    StaffInviteRequest,
    VendorRegisterRequest,
)
from app.schemas.common import ok
from app.services.audit_service import AuditService
from app.services.auth_service import AuthService

router = APIRouter(tags=["auth"])


# ---------------------------------------------------------------- vendors
@router.post("/auth/register-vendor", status_code=status.HTTP_201_CREATED)
async def register_vendor(
    payload: VendorRegisterRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: None = Depends(auth_rate_limit),
) -> Dict[str, Any]:
    result = await AuthService(db).register_vendor(payload.model_dump())
    await AuditService(db).record(
        tenant_id=result["tenant_id"],
        actor_id=result["staff_id"],
        actor_email=payload.email,
        action="register",
        module="auth",
        ip=client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    return ok(
        {
            "tenant_id": result["tenant_id"],
            "message": "Registration received. Check your email to verify the account.",
        }
    )


@router.post("/auth/verify-email")
async def verify_email(
    payload: EmailVerificationRequest, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    return ok(await AuthService(db).verify_email(payload.token))


@router.post("/auth/login")
async def login(
    payload: LoginRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: None = Depends(auth_rate_limit),
) -> Dict[str, Any]:
    async with login_guard(payload.email):
        staff, tokens = await AuthService(db).login_staff(payload.email, payload.password)
    await AuditService(db).record(
        tenant_id=staff["tenant_id"],
        actor_id=staff["id"],
        actor_email=staff["email"],
        action="login",
        module="auth",
        ip=client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    return ok(tokens)


@router.post("/auth/forgot-password")
async def forgot_password(
    payload: ForgotPasswordRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: None = Depends(auth_rate_limit),
) -> Dict[str, Any]:
    result = await AuthService(db).request_password_reset(payload.email)
    # The reset token is returned for the email layer to consume; it is not
    # echoed to the client.
    result.pop("reset_token", None)
    return ok({"message": "If that email is registered, a reset link has been sent."})


@router.post("/auth/reset-password")
async def reset_password(
    payload: ResetPasswordRequest, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    return ok(await AuthService(db).reset_password(payload.token, payload.new_password))


# ------------------------------------------------------------ staff invites
@router.post("/vendor/staff/invite", status_code=status.HTTP_201_CREATED)
async def invite_staff(
    payload: StaffInviteRequest,
    staff: Dict[str, Any] = Depends(get_current_staff),
    tenant_id: str = Depends(get_tenant_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    result = await AuthService(db).invite_staff(tenant_id, payload.model_dump(), staff["id"])
    result.pop("invite_token", None)
    return ok({"staff_id": result["staff_id"], "message": "Invitation sent."})


@router.post("/auth/accept-invite")
async def accept_invite(
    payload: AcceptInviteRequest, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    return ok(await AuthService(db).accept_invite(payload.token, payload.password))


# ----------------------------------------------------------------- admins
@router.post("/admin/auth/login")
async def admin_login(
    payload: AdminLoginRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: None = Depends(auth_rate_limit),
) -> Dict[str, Any]:
    async with login_guard(f"admin:{payload.email}"):
        admin, tokens = await AuthService(db).login_admin(
            payload.email, payload.password, payload.totp_code
        )
    await AuditService(db).record(
        tenant_id=None,
        actor_id=admin["id"],
        actor_email=admin["email"],
        action="login",
        module="admin_auth",
        ip=client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    return ok(tokens)


# ------------------------------------------------------------ shared token
@router.post("/auth/refresh")
async def refresh_token(
    payload: RefreshRequest, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    return ok(await AuthService(db).rotate_refresh_token(payload.refresh_token))


@router.post("/auth/logout")
async def logout(
    payload: RefreshRequest, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    return ok(await AuthService(db).logout(payload.refresh_token))


@router.get("/auth/me")
async def me(
    principal: Dict[str, Any] = Depends(get_current_principal),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    return ok(await AuthService(db).describe_principal(principal))
