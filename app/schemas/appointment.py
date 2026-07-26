"""Appointment and slot schemas."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.models.enums import AppointmentStatus, PaymentMode


class SlotQuery(BaseModel):
    service_id: str
    provider_id: str
    date: str  # ISO date in the branch timezone


class Slot(BaseModel):
    start: datetime
    end: datetime
    available: bool


class SlotsResponse(BaseModel):
    service_id: str
    provider_id: str
    date: str
    timezone: str
    slots: List[Slot]


class AppointmentCreate(BaseModel):
    tenant_id: str
    branch_id: str
    service_id: str
    provider_id: str
    slot_start: datetime
    notes: Optional[str] = Field(default=None, max_length=500)
    customer_name: Optional[str] = Field(default=None, max_length=120)
    customer_phone: Optional[str] = Field(default=None, max_length=30)


class AppointmentReschedule(BaseModel):
    slot_start: datetime


class AppointmentStatusUpdate(BaseModel):
    status: AppointmentStatus
    reason: Optional[str] = Field(default=None, max_length=300)


class AppointmentResponse(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    service_id: str
    provider_id: str
    user_id: Optional[str] = None
    status: AppointmentStatus
    payment_mode: PaymentMode
    payment_status: str
    price: float
    slot_start: datetime
    slot_end: datetime
    business_day: str
    customer_name: Optional[str] = None
    queue_token_id: Optional[str] = None
    created_at: datetime


class WaitlistRequest(BaseModel):
    service_id: str
    provider_id: str
    date: str
