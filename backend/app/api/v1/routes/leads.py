"""Public sales lead capture — the /demo and "start trial" forms on the
marketing site post here. Fully unauthenticated; protected by the tighter
auth-endpoint rate limit since a form like this is a spam target."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, BackgroundTasks, Depends, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.deps import get_db
from app.core.config import settings
from app.core.rate_limit import auth_rate_limit
from app.repositories.leads import LeadRepository
from app.schemas.common import ok
from app.schemas.lead import LeadCreateRequest
from app.services.email_service import send_email

router = APIRouter(prefix="/leads", tags=["leads"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_lead(
    payload: LeadCreateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: None = Depends(auth_rate_limit),
) -> Dict[str, Any]:
    lead = await LeadRepository(db).create(payload.model_dump())

    # A real SMTP send takes seconds — the person filling out this form
    # shouldn't wait on it. The lead is already saved by the time this runs.
    notify_to = settings.SALES_NOTIFICATION_EMAIL or settings.SMTP_FROM_EMAIL
    if notify_to:
        subject = f"New {payload.segment} lead: {payload.organisation}"
        body = (
            f"Name: {payload.name}\n"
            f"Organisation: {payload.organisation}\n"
            f"Segment: {payload.segment}\n"
            f"Phone: {payload.phone}\n"
            f"Email: {payload.email}\n"
            f"Departments: {payload.department_count or '-'}\n"
            f"Branches: {payload.branch_count or '-'}\n"
        )
        background_tasks.add_task(send_email, notify_to, subject, body)

    return ok(
        {
            "id": lead["id"],
            "message": "Thanks — someone from our team will reach out shortly.",
        }
    )
