"""Public sales lead capture — the /demo and "start trial" forms on the
marketing site post here. Fully unauthenticated; protected by the tighter
auth-endpoint rate limit since a form like this is a spam target."""
from __future__ import annotations

from typing import Annotated, Any, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import ValidationError as PydanticValidationError

from app.api.deps import get_db
from app.core.config import settings
from app.core.errors import ValidationError
from app.core.rate_limit import auth_rate_limit
from app.models.enums import LeadStatus
from app.repositories.leads import LeadRepository
from app.schemas.common import ok
from app.schemas.lead import LeadCreateRequest
from app.services.email_service import send_email
from app.services.file_storage import save_lead_certificate

router = APIRouter(prefix="/leads", tags=["leads"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_lead(
    background_tasks: BackgroundTasks,
    # A file upload forces multipart/form-data, which can't carry a nested
    # JSON body — every field arrives as its own form part instead.
    name: Annotated[str, Form()],
    organisation: Annotated[str, Form()],
    segment: Annotated[str, Form()],
    phone: Annotated[str, Form()],
    email: Annotated[str, Form()],
    registration_certificate: UploadFile = File(...),
    department_count: Annotated[Optional[str], Form()] = None,
    branch_count: Annotated[Optional[str], Form()] = None,
    plan_interest: Annotated[Optional[str], Form()] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: None = Depends(auth_rate_limit),
) -> Dict[str, Any]:
    try:
        payload = LeadCreateRequest(
            name=name,
            organisation=organisation,
            segment=segment,
            phone=phone,
            email=email,
            department_count=department_count,
            branch_count=branch_count,
            plan_interest=plan_interest,
        )
    except PydanticValidationError as exc:
        details = [
            {"field": ".".join(str(p) for p in err["loc"]), "message": err["msg"]}
            for err in exc.errors()
        ]
        raise ValidationError(details=details) from exc

    certificate_path = await save_lead_certificate(registration_certificate)
    lead = await LeadRepository(db).create(
        {
            **payload.model_dump(),
            "registration_certificate_path": certificate_path,
            "status": LeadStatus.PENDING.value,
        }
    )

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
            f"Plan interest: {payload.plan_interest or '-'}\n"
            f"Registration certificate: {certificate_path}\n"
        )
        background_tasks.add_task(send_email, notify_to, subject, body)

    return ok(
        {
            "id": lead["id"],
            "message": "Thanks — someone from our team will reach out shortly.",
        }
    )
