"""Tenant, branch, provider and service schemas."""
from __future__ import annotations

from datetime import time
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import PaymentMode


class WorkingHours(BaseModel):
    """Per-weekday opening hours. weekday: 0=Monday .. 6=Sunday."""

    weekday: int = Field(..., ge=0, le=6)
    opens_at: time
    closes_at: time
    is_closed: bool = False


class AddressModel(BaseModel):
    line1: str = Field(..., max_length=200)
    line2: Optional[str] = Field(default=None, max_length=200)
    city: str = Field(..., max_length=100)
    state: Optional[str] = Field(default=None, max_length=100)
    postal_code: Optional[str] = Field(default=None, max_length=20)
    country: str = Field(..., min_length=2, max_length=60)


class OrganizationUpdate(BaseModel):
    company_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    logo_url: Optional[str] = Field(default=None, max_length=500)
    business_type: Optional[str] = Field(default=None, max_length=80)
    timezone: Optional[str] = Field(default=None, max_length=64)
    language: Optional[str] = Field(default=None, max_length=10)
    currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    phone: Optional[str] = Field(default=None, max_length=30)
    email: Optional[EmailStr] = None
    website: Optional[str] = Field(default=None, max_length=200)
    tax_number: Optional[str] = Field(default=None, max_length=40)
    registration_number: Optional[str] = Field(default=None, max_length=60)
    address: Optional[AddressModel] = None
    working_hours: Optional[List[WorkingHours]] = None
    holidays: Optional[List[str]] = None  # ISO dates the org is closed


class VendorDeleteRequest(BaseModel):
    """The admin must retype the vendor's own company name - a second,
    content-aware confirmation on top of the UI's own confirm step."""

    confirm_company_name: str = Field(..., min_length=1, max_length=120)


class BranchCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=30)
    address: Optional[AddressModel] = None
    timezone: str = Field(default="UTC", max_length=64)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    working_hours: List[WorkingHours] = Field(default_factory=list)
    holidays: List[str] = Field(default_factory=list)


class BranchUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=30)
    address: Optional[AddressModel] = None
    timezone: Optional[str] = Field(default=None, max_length=64)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    working_hours: Optional[List[WorkingHours]] = None
    holidays: Optional[List[str]] = None


class ProviderLeave(BaseModel):
    start_date: str
    end_date: str
    reason: Optional[str] = Field(default=None, max_length=200)


class ProviderCreate(BaseModel):
    """A generic Service Provider. A doctor is one type of provider; Qly stores
    no clinical data, only scheduling and fee information."""

    name: str = Field(..., min_length=2, max_length=120)
    branch_id: str
    photo_url: Optional[str] = Field(default=None, max_length=500)
    title: Optional[str] = Field(default=None, max_length=80)
    specialty: Optional[str] = Field(default=None, max_length=120)
    experience_years: Optional[int] = Field(default=None, ge=0, le=80)
    consultation_fee: float = Field(default=0, ge=0)
    working_hours: List[WorkingHours] = Field(default_factory=list)
    leaves: List[ProviderLeave] = Field(default_factory=list)


class ProviderUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    photo_url: Optional[str] = Field(default=None, max_length=500)
    title: Optional[str] = Field(default=None, max_length=80)
    specialty: Optional[str] = Field(default=None, max_length=120)
    experience_years: Optional[int] = Field(default=None, ge=0, le=80)
    consultation_fee: Optional[float] = Field(default=None, ge=0)
    working_hours: Optional[List[WorkingHours]] = None
    leaves: Optional[List[ProviderLeave]] = None
    status: Optional[str] = Field(default=None, pattern="^(active|suspended)$")


class ServiceCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    branch_id: str
    description: Optional[str] = Field(default=None, max_length=1000)
    duration_minutes: int = Field(..., ge=1, le=600)
    buffer_minutes: int = Field(default=0, ge=0, le=180)
    price: float = Field(default=0, ge=0)
    payment_mode: PaymentMode = PaymentMode.PAY_AT_VENUE
    queue_capacity: int = Field(default=100, ge=1, le=10000)
    provider_ids: List[str] = Field(default_factory=list)
    cancellation_window_minutes: int = Field(default=60, ge=0)
    no_show_after_minutes: int = Field(default=10, ge=0, le=240)
    token_prefix: Optional[str] = Field(default=None, max_length=4)
    daily_token_reset: bool = True


class ServiceUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1000)
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=600)
    buffer_minutes: Optional[int] = Field(default=None, ge=0, le=180)
    price: Optional[float] = Field(default=None, ge=0)
    payment_mode: Optional[PaymentMode] = None
    queue_capacity: Optional[int] = Field(default=None, ge=1, le=10000)
    provider_ids: Optional[List[str]] = None
    cancellation_window_minutes: Optional[int] = Field(default=None, ge=0)
    no_show_after_minutes: Optional[int] = Field(default=None, ge=0, le=240)
    token_prefix: Optional[str] = Field(default=None, max_length=4)
    daily_token_reset: Optional[bool] = None
