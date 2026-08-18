"""Sales lead capture — the public /demo and "start trial" form."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class LeadCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    organisation: str = Field(..., min_length=2, max_length=160)
    segment: str = Field(..., pattern="^(clinic|hospital)$")
    phone: str = Field(..., min_length=6, max_length=30)
    email: EmailStr
    department_count: Optional[str] = Field(default=None, max_length=20)
    branch_count: Optional[str] = Field(default=None, max_length=20)
    plan_interest: Optional[str] = Field(default=None, max_length=40)


class LeadResponse(BaseModel):
    id: str
    message: str
