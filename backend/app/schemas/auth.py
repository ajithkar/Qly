"""Authentication schemas for vendor, admin, staff-invite and end-user flows."""
from __future__ import annotations

from datetime import date
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field


class VendorRegisterRequest(BaseModel):
    company_name: str = Field(..., min_length=2, max_length=120)
    owner_name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(..., min_length=10, max_length=128)
    plan_code: str = Field(..., min_length=2, max_length=40)
    timezone: str = Field(default="UTC", max_length=64)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    accepted_terms_version: str = Field(..., max_length=20)
    accepted_privacy_version: str = Field(..., max_length=20)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class AdminLoginRequest(LoginRequest):
    totp_code: Optional[str] = Field(default=None, min_length=6, max_length=6)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


class EmailVerificationRequest(BaseModel):
    token: str = Field(..., min_length=10)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=10)
    new_password: str = Field(..., min_length=10, max_length=128)


class StaffInviteRequest(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=2, max_length=120)
    role: str = Field(..., pattern="^(manager|receptionist|provider|assistant|controller)$")
    branch_id: Optional[str] = None
    custom_permissions: List[str] = Field(default_factory=list)


class AcceptInviteRequest(BaseModel):
    token: str = Field(..., min_length=10)
    password: str = Field(..., min_length=10, max_length=128)


class GoogleCallbackRequest(BaseModel):
    code: str = Field(..., min_length=5)
    state: Optional[str] = None


class UserProfileUpdate(BaseModel):
    """End users may edit name and date of birth.

    Note: no health fields are stored (resolved product decision — Qly is an
    industry-agnostic queue platform and holds no medical data).
    """

    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    date_of_birth: Optional[date] = None


class PrincipalResponse(BaseModel):
    """Payload of GET /auth/me — the UI mirrors these permissions in its guards."""

    id: str
    principal_type: str
    email: Optional[str] = None
    name: Optional[str] = None
    role: Optional[str] = None
    tenant_id: Optional[str] = None
    branch_id: Optional[str] = None
    permissions: List[str] = Field(default_factory=list)
    status: str
