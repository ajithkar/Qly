"""Billing schemas."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class CheckoutRequest(BaseModel):
    plan_code: str = Field(..., min_length=2, max_length=40)
    billing_cycle: str = Field(default="monthly", pattern="^(monthly|yearly)$")


class PlanCreate(BaseModel):
    code: str = Field(..., min_length=2, max_length=40, pattern="^[a-z0-9_-]+$")
    name: str = Field(..., min_length=2, max_length=80)
    monthly_price: float = Field(..., ge=0)
    yearly_price: float = Field(..., ge=0)
    # None means unlimited.
    max_branches: Optional[int] = Field(default=None, ge=1)
    max_providers: Optional[int] = Field(default=None, ge=1)
    max_staff: Optional[int] = Field(default=None, ge=1)
    max_services: Optional[int] = Field(default=None, ge=1)
    monthly_tokens: Optional[int] = Field(default=None, ge=1)
    storage_mb: Optional[int] = Field(default=None, ge=1)
    reports_access: bool = True
    export_access: bool = True
    api_access: bool = False
    feature_flags: list[str] = Field(default_factory=list)
    # A vendor may activate this plan once, without payment, for
    # StripeService.TRIAL_PERIOD_DAYS. See StripeService._activate_trial.
    is_trial: bool = False


class PlanUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    monthly_price: Optional[float] = Field(default=None, ge=0)
    yearly_price: Optional[float] = Field(default=None, ge=0)
    max_branches: Optional[int] = Field(default=None, ge=1)
    max_providers: Optional[int] = Field(default=None, ge=1)
    max_staff: Optional[int] = Field(default=None, ge=1)
    max_services: Optional[int] = Field(default=None, ge=1)
    monthly_tokens: Optional[int] = Field(default=None, ge=1)
    storage_mb: Optional[int] = Field(default=None, ge=1)
    reports_access: Optional[bool] = None
    export_access: Optional[bool] = None
    api_access: Optional[bool] = None
    feature_flags: Optional[list[str]] = None
    is_trial: Optional[bool] = None
    archived: Optional[bool] = None
