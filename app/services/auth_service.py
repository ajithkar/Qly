"""Authentication: vendor registration, login, verification, reset, staff
invitations, admin login, Google OAuth, and refresh-token rotation."""
from __future__ import annotations

import re
import uuid
from datetime import timedelta
from typing import Any, Dict, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.errors import AuthenticationError, Conflict, NotFound, ValidationError
from app.core.logging import get_logger
from app.core.permissions import resolve_permissions
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_opaque_token,
    hash_opaque_token,
    hash_password,
    utcnow,
    validate_password_strength,
    verify_password,
)
from app.models.enums import AccountStatus, PrincipalType, TenantStatus
from app.repositories.catalog import PlanRepository
from app.repositories.identity import (
    AdminRepository,
    RefreshTokenRepository,
    StaffRepository,
    TenantRepository,
    UserRepository,
)
from app.repositories.queues import ConsoleAccessRepository
from app.services.email_service import send_email

logger = get_logger(__name__)

INVITE_TTL_HOURS = 72
RESET_TTL_HOURS = 2


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or f"org-{uuid.uuid4().hex[:8]}"


class AuthService:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.db = db
        self.tenants = TenantRepository(db)
        self.staff = StaffRepository(db)
        self.users = UserRepository(db)
        self.admins = AdminRepository(db)
        self.refresh = RefreshTokenRepository(db)
        self.plans = PlanRepository(db)
        self.console_access = ConsoleAccessRepository(db)

    # ------------------------------------------------------------------
    # Vendor registration & login
    # ------------------------------------------------------------------
    async def register_vendor(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        email = payload["email"].lower()
        validate_password_strength(payload["password"])

        if await self.tenants.get_by_email(email):
            raise Conflict("An account with that email already exists.", code="email_taken")
        if await self.staff.get_by_email_any_tenant(email):
            raise Conflict("An account with that email already exists.", code="email_taken")

        plan = await self.plans.get_by_code(payload["plan_code"])
        if not plan:
            raise NotFound("Selected plan does not exist.")

        # Ensure a unique slug.
        base = slugify(payload["company_name"])
        slug, suffix = base, 1
        while await self.tenants.get_by_slug(slug):
            slug = f"{base}-{suffix}"
            suffix += 1

        tenant = await self.tenants.create(
            {
                "company_name": payload["company_name"],
                "slug": slug,
                "owner_email": email,
                "owner_name": payload["owner_name"],
                "timezone": payload.get("timezone", "UTC"),
                "currency": payload.get("currency", "USD"),
                "language": "en",
                # Stays pending until Stripe's webhook confirms payment -
                # the Checkout success page is never the source of truth.
                "status": TenantStatus.PENDING.value,
                "plan_code": plan["code"],
            }
        )

        raw_verification = generate_opaque_token()
        owner = await self.staff.create(
            {
                "email": email,
                "name": payload["owner_name"],
                "password_hash": hash_password(payload["password"]),
                "role": "owner",
                "branch_id": None,
                "custom_permissions": [],
                "status": AccountStatus.PENDING.value,
                "email_verified": False,
                "verification_token_hash": hash_opaque_token(raw_verification),
            },
            tenant["id"],
        )

        await self._record_consent(
            owner["id"], "terms", payload["accepted_terms_version"]
        )
        await self._record_consent(
            owner["id"], "privacy", payload["accepted_privacy_version"]
        )

        verify_url = f"{settings.FRONTEND_URL}/verify-email?token={raw_verification}"
        await send_email(
            email,
            "Verify your Qly account",
            "Welcome to Qly!\n\n"
            f"Verify your email address to activate your account:\n{verify_url}\n\n"
            "If you didn't request this, you can ignore this email.",
        )

        logger.info("vendor_registered", extra={"tenant_id": tenant["id"]})
        return {
            "tenant_id": tenant["id"],
            "staff_id": owner["id"],
            "plan_code": plan["code"],
            # Returned so the caller can email it. Never expose in production logs.
            "verification_token": raw_verification,
        }

    async def create_vendor_by_admin(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Super Admin onboarding: creates the tenant and owner, but both stay
        pending until the vendor completes the Stripe Checkout payment the
        caller generates right after this. The owner has no password yet -
        one is generated and emailed once the webhook confirms payment (see
        `StripeService._provision_owner_if_pending`)."""
        email = payload["email"].lower()

        if await self.tenants.get_by_email(email):
            raise Conflict("An account with that email already exists.", code="email_taken")
        if await self.staff.get_by_email_any_tenant(email):
            raise Conflict("An account with that email already exists.", code="email_taken")

        plan = await self.plans.get_by_code(payload["plan_code"])
        if not plan:
            raise NotFound("Selected plan does not exist.")

        base = slugify(payload["company_name"])
        slug, suffix = base, 1
        while await self.tenants.get_by_slug(slug):
            slug = f"{base}-{suffix}"
            suffix += 1

        tenant = await self.tenants.create(
            {
                "company_name": payload["company_name"],
                "slug": slug,
                "owner_email": email,
                "owner_name": payload["owner_name"],
                "timezone": payload.get("timezone", "UTC"),
                "currency": payload.get("currency", "USD"),
                "language": "en",
                "status": TenantStatus.PENDING.value,
                "plan_code": plan["code"],
            }
        )

        await self.staff.create(
            {
                "email": email,
                "name": payload["owner_name"],
                "password_hash": None,
                "role": "owner",
                "branch_id": None,
                "custom_permissions": [],
                "status": AccountStatus.PENDING.value,
                "email_verified": False,
            },
            tenant["id"],
        )

        logger.info("vendor_created_by_admin", extra={"tenant_id": tenant["id"]})
        return tenant

    async def verify_email(self, raw_token: str) -> dict:
        staff = await self.staff.get_by_verification_token(raw_token)
        if not staff:
            raise ValidationError("Verification link is invalid or has expired.")
        await self.staff.set_tokens(
            staff["id"],
            {
                "email_verified": True,
                "status": AccountStatus.ACTIVE.value,
                "verification_token_hash": None,
            },
        )
        return {"verified": True}

    async def login_staff(self, email: str, password: str) -> Tuple[dict, dict]:
        staff = await self.staff.get_by_email_any_tenant(email)
        if not staff or not verify_password(password, staff.get("password_hash", "")):
            # Identical message for unknown email and wrong password - no enumeration.
            raise AuthenticationError("Email or password is incorrect.")
        if not staff.get("email_verified"):
            raise AuthenticationError(
                "Please verify your email address first.", code="email_not_verified"
            )
        if staff.get("status") == AccountStatus.SUSPENDED.value:
            raise AuthenticationError("This account is suspended.", code="account_suspended")

        tenant = await self.tenants.get_by_id(staff["tenant_id"])
        if not tenant or tenant.get("status") == TenantStatus.SUSPENDED.value:
            raise AuthenticationError(
                "This organisation is suspended.", code="tenant_suspended"
            )

        tokens = await self._issue_tokens(
            subject=staff["id"],
            principal_type=PrincipalType.STAFF.value,
            tenant_id=staff["tenant_id"],
            role=staff["role"],
        )
        return staff, tokens

    async def login_via_console_code(self, queue_id: str, code: str) -> Tuple[dict, dict]:
        """Passwordless entry point for a shared Operator Console code.

        The code is single-use and tied to one queue; `consume` claims it
        atomically so a leaked/guessed code cannot be replayed even if two
        requests race."""
        record = await self.console_access.consume(queue_id, hash_opaque_token(code))
        if not record:
            raise AuthenticationError("That code is invalid or has expired.", code="invalid_code")

        staff = await self.staff.get_by_id_any_tenant(record["staff_id"])
        if not staff or staff.get("status") == AccountStatus.SUSPENDED.value:
            raise AuthenticationError("This account is no longer available.")

        tokens = await self._issue_tokens(
            subject=staff["id"],
            principal_type=PrincipalType.STAFF.value,
            tenant_id=staff["tenant_id"],
            role=staff["role"],
        )
        return staff, tokens

    async def login_admin(self, email: str, password: str, totp: Optional[str]) -> Tuple[dict, dict]:
        admin = await self.admins.get_by_email(email)
        if not admin or not verify_password(password, admin.get("password_hash", "")):
            raise AuthenticationError("Email or password is incorrect.")
        if admin.get("status") == AccountStatus.SUSPENDED.value:
            raise AuthenticationError("This account is suspended.", code="account_suspended")
        if admin.get("totp_enabled") and not totp:
            raise AuthenticationError(
                "A two-factor code is required.", code="totp_required"
            )

        tokens = await self._issue_tokens(
            subject=admin["id"],
            principal_type=PrincipalType.ADMIN.value,
            role=admin["role"],
        )
        return admin, tokens

    # ------------------------------------------------------------------
    # Staff invitations
    # ------------------------------------------------------------------
    async def invite_staff(
        self, tenant_id: str, payload: Dict[str, Any], actor_id: str
    ) -> dict:
        email = payload["email"].lower()
        if await self.staff.get_by_email(tenant_id, email):
            raise Conflict("That email is already a member of this organisation.")

        raw_invite = generate_opaque_token()
        staff = await self.staff.create(
            {
                "email": email,
                "name": payload["name"],
                "role": payload["role"],
                "branch_id": payload.get("branch_id"),
                "provider_id": payload.get("provider_id"),
                "custom_permissions": payload.get("custom_permissions", []),
                "status": AccountStatus.PENDING.value,
                "email_verified": False,
                "password_hash": None,
                "invite_token_hash": hash_opaque_token(raw_invite),
                "invite_expires_at": utcnow() + timedelta(hours=INVITE_TTL_HOURS),
            },
            tenant_id,
            actor_id,
        )
        invite_url = f"{settings.FRONTEND_URL}/accept-invite?token={raw_invite}"
        await send_email(
            email,
            "You've been invited to join a team on Qly",
            f"You've been invited to join as {payload['role']}.\n\n"
            f"Accept your invite and set a password:\n{invite_url}\n\n"
            f"This link expires in {INVITE_TTL_HOURS} hours.",
        )
        return {"staff_id": staff["id"], "invite_token": raw_invite}

    async def accept_invite(self, raw_token: str, password: str) -> dict:
        staff = await self.staff.get_by_invite_token(raw_token)
        if not staff:
            raise ValidationError("This invitation is invalid or has expired.")
        validate_password_strength(password)
        await self.staff.set_tokens(
            staff["id"],
            {
                "password_hash": hash_password(password),
                "status": AccountStatus.ACTIVE.value,
                "email_verified": True,
                "invite_token_hash": None,
                "invite_expires_at": None,
            },
        )
        return {"activated": True}

    # ------------------------------------------------------------------
    # Password reset
    # ------------------------------------------------------------------
    async def request_password_reset(self, email: str) -> dict:
        staff = await self.staff.get_by_email_any_tenant(email)
        # Always report success - never reveal whether an address is registered.
        if staff:
            raw = generate_opaque_token()
            await self.staff.set_tokens(
                staff["id"],
                {
                    "reset_token_hash": hash_opaque_token(raw),
                    "reset_expires_at": utcnow() + timedelta(hours=RESET_TTL_HOURS),
                },
            )
            reset_url = f"{settings.FRONTEND_URL}/reset-password?token={raw}"
            await send_email(
                staff["email"],
                "Reset your Qly password",
                "We received a request to reset your password.\n\n"
                f"Choose a new password:\n{reset_url}\n\n"
                f"This link expires in {RESET_TTL_HOURS} hours. "
                "If you didn't request this, you can ignore this email.",
            )
            return {"sent": True, "reset_token": raw}
        return {"sent": True}

    async def reset_password(self, raw_token: str, new_password: str) -> dict:
        staff = await self.staff.get_by_reset_token(raw_token)
        if not staff:
            raise ValidationError("This reset link is invalid or has expired.")
        validate_password_strength(new_password)
        await self.staff.set_tokens(
            staff["id"],
            {
                "password_hash": hash_password(new_password),
                "reset_token_hash": None,
                "reset_expires_at": None,
            },
        )
        # Any existing session is invalidated after a password change.
        await self.refresh.revoke_all_for_subject(staff["id"])
        return {"reset": True}

    async def change_password(
        self, staff: Dict[str, Any], current_password: str, new_password: str
    ) -> dict:
        """Authenticated self-service change - also clears the forced
        first-login flag set when a temp password was issued. Unlike
        `reset_password`, this does not revoke other sessions: the caller is
        already mid-session right after logging in with the password being
        replaced, and revoking here would force a surprise logout on their
        next token refresh."""
        if not verify_password(current_password, staff.get("password_hash", "")):
            raise AuthenticationError("Current password is incorrect.")
        validate_password_strength(new_password)
        await self.staff.set_tokens(
            staff["id"],
            {
                "password_hash": hash_password(new_password),
                "must_change_password": False,
            },
        )
        return {"changed": True}

    # ------------------------------------------------------------------
    # End users (Google OAuth only)
    # ------------------------------------------------------------------
    async def login_google_user(self, profile: Dict[str, Any]) -> Tuple[dict, dict]:
        if not profile.get("sub") or not profile.get("email"):
            raise AuthenticationError("Google profile is incomplete.")
        user = await self.users.upsert_google_user(profile)
        if user.get("status") == AccountStatus.SUSPENDED.value:
            raise AuthenticationError("This account is suspended.", code="account_suspended")
        tokens = await self._issue_tokens(
            subject=user["id"], principal_type=PrincipalType.USER.value
        )
        return user, tokens

    # ------------------------------------------------------------------
    # Token lifecycle
    # ------------------------------------------------------------------
    async def _issue_tokens(
        self,
        *,
        subject: str,
        principal_type: str,
        tenant_id: Optional[str] = None,
        role: Optional[str] = None,
        family: Optional[str] = None,
    ) -> dict:
        family = family or str(uuid.uuid4())
        access = create_access_token(
            subject=subject, principal_type=principal_type, tenant_id=tenant_id, role=role
        )
        refresh = create_refresh_token(
            subject=subject, principal_type=principal_type, family_id=family
        )
        await self.refresh.store(
            raw_token=refresh,
            subject=subject,
            principal_type=principal_type,
            family=family,
            ttl_days=settings.REFRESH_TOKEN_EXPIRE_DAYS,
        )
        return {
            "access_token": access,
            "refresh_token": refresh,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        }

    async def rotate_refresh_token(self, raw_token: str) -> dict:
        payload = decode_token(raw_token, expected_type="refresh")
        record = await self.refresh.get(raw_token)

        if record is None:
            raise AuthenticationError("Refresh token is not recognised.")
        if record.get("revoked"):
            # Replay of a rotated token: assume theft, kill the whole family.
            await self.refresh.revoke_family(record["family"])
            logger.warning("refresh_replay_detected", extra={"family": record["family"]})
            raise AuthenticationError(
                "Session is no longer valid. Please sign in again.", code="token_reuse"
            )

        await self.refresh.revoke(raw_token)

        subject = payload["sub"]
        principal_type = payload["principal_type"]
        tenant_id, role = None, None
        if principal_type == PrincipalType.STAFF.value:
            staff = await self.staff.get_by_id(subject)
            if not staff or staff.get("status") == AccountStatus.SUSPENDED.value:
                raise AuthenticationError("Account is no longer active.")
            tenant_id, role = staff["tenant_id"], staff["role"]
        elif principal_type == PrincipalType.ADMIN.value:
            admin = await self.admins.get_by_id(subject)
            if not admin:
                raise AuthenticationError("Account is no longer active.")
            role = admin["role"]

        return await self._issue_tokens(
            subject=subject,
            principal_type=principal_type,
            tenant_id=tenant_id,
            role=role,
            family=record["family"],
        )

    async def logout(self, raw_refresh_token: Optional[str]) -> dict:
        if raw_refresh_token:
            record = await self.refresh.get(raw_refresh_token)
            if record:
                await self.refresh.revoke_family(record["family"])
        return {"logged_out": True}

    # ------------------------------------------------------------------
    async def describe_principal(self, principal: Dict[str, Any]) -> dict:
        """Payload for GET /auth/me, including resolved permissions so the UI
        can mirror the same guards the API enforces."""
        permissions = sorted(
            resolve_permissions(
                principal["principal_type"],
                principal.get("role", ""),
                principal.get("custom_permissions", []),
            )
        )
        return {
            "id": principal["id"],
            "principal_type": principal["principal_type"],
            "email": principal.get("email"),
            "name": principal.get("name"),
            "role": principal.get("role"),
            "tenant_id": principal.get("tenant_id"),
            "branch_id": principal.get("branch_id"),
            "provider_id": principal.get("provider_id"),
            "permissions": permissions,
            "status": principal.get("status", AccountStatus.ACTIVE.value),
            "must_change_password": bool(principal.get("must_change_password", False)),
        }

    async def _record_consent(self, subject_id: str, document: str, version: str) -> None:
        await self.db["consents"].insert_one(
            {
                "subject_id": subject_id,
                "document": document,
                "version": version,
                "accepted_at": utcnow(),
            }
        )
