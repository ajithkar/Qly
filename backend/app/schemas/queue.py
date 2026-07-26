"""Queue, token and live-monitor schemas."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.models.enums import QueueStatus, TokenPriority, TokenStatus


class QueueCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    branch_id: str
    service_id: str
    provider_id: Optional[str] = None
    max_tokens: Optional[int] = Field(default=None, ge=1, le=10000)


class QueueUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    provider_id: Optional[str] = None
    max_tokens: Optional[int] = Field(default=None, ge=1, le=10000)


class QueueResponse(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    service_id: str
    provider_id: Optional[str] = None
    name: str
    status: QueueStatus
    business_day: str
    created_at: datetime


class JoinQueueRequest(BaseModel):
    """Used by end users (authenticated) and by QR/kiosk self check-in."""

    service_id: str
    branch_id: str
    provider_id: Optional[str] = None
    customer_name: Optional[str] = Field(default=None, max_length=120)
    customer_phone: Optional[str] = Field(default=None, max_length=30)
    priority: TokenPriority = TokenPriority.NORMAL
    appointment_id: Optional[str] = None  # set when converting an appointment


class WalkInTokenRequest(BaseModel):
    """Vendor-side token generation at the counter."""

    customer_name: str = Field(..., min_length=1, max_length=120)
    customer_phone: Optional[str] = Field(default=None, max_length=30)
    priority: TokenPriority = TokenPriority.NORMAL


class TokenResponse(BaseModel):
    id: str
    queue_id: str
    token_number: str
    sequence: int
    status: TokenStatus
    priority: TokenPriority
    position: Optional[int] = None
    people_ahead: Optional[int] = None
    estimated_wait_minutes: Optional[float] = None
    customer_name: Optional[str] = None
    provider_id: Optional[str] = None
    created_at: datetime
    called_at: Optional[datetime] = None
    served_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class TransferTokenRequest(BaseModel):
    target_queue_id: str
    reason: Optional[str] = Field(default=None, max_length=200)


class LiveMonitorResponse(BaseModel):
    """Payload for the Operator Console and the public display board."""

    queue_id: str
    status: QueueStatus
    current_token: Optional[TokenResponse] = None
    next_token: Optional[TokenResponse] = None
    waiting_count: int
    serving_count: int
    completed_count: int
    skipped_count: int
    no_show_count: int
    average_wait_minutes: float
    average_service_minutes: float
    estimated_wait_minutes: float
    provider_status: List[dict] = Field(default_factory=list)
    updated_at: datetime
