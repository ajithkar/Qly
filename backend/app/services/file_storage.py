"""Local disk storage for files uploaded through public forms — currently
just the vendor's business registration certificate on the demo/trial form.
No object storage is wired up yet, so these land on the API host's disk
under settings.LEAD_UPLOAD_DIR."""
from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings
from app.core.errors import ValidationError

ALLOWED_CONTENT_TYPES = {"application/pdf", "image/jpeg", "image/jpg"}
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg"}


async def save_lead_certificate(file: UploadFile) -> str:
    """Validates and persists a vendor's business registration certificate.

    Returns the path it was written to (relative to the working directory).
    Raises ValidationError on an unsupported type, an empty file, or a file
    over LEAD_UPLOAD_MAX_MB.
    """
    extension = Path(file.filename or "").suffix.lower()
    if extension not in ALLOWED_EXTENSIONS or file.content_type not in ALLOWED_CONTENT_TYPES:
        raise ValidationError(
            "The certificate must be a PDF or JPG file.",
            details=[{"field": "registration_certificate", "message": "Unsupported file type."}],
        )

    max_bytes = settings.LEAD_UPLOAD_MAX_MB * 1024 * 1024
    content = await file.read(max_bytes + 1)
    if not content:
        raise ValidationError(
            "The certificate file is empty.",
            details=[{"field": "registration_certificate", "message": "Empty file."}],
        )
    if len(content) > max_bytes:
        raise ValidationError(
            f"The certificate must be under {settings.LEAD_UPLOAD_MAX_MB}MB.",
            details=[{"field": "registration_certificate", "message": "File too large."}],
        )

    upload_dir = Path(settings.LEAD_UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}{extension}"
    (upload_dir / stored_name).write_bytes(content)
    return str(upload_dir / stored_name)


def delete_lead_certificate(path: str) -> None:
    """Removes a previously-saved certificate from disk, e.g. when the
    vendor it belongs to is deleted. `path` is a value this module itself
    wrote to Mongo, but it is resolved and confirmed to stay inside
    LEAD_UPLOAD_DIR before unlinking regardless, and a missing file is not
    an error - the outcome the caller wants ("no certificate on disk") is
    already true."""
    if not path:
        return
    upload_dir = Path(settings.LEAD_UPLOAD_DIR).resolve()
    candidate = Path(path).resolve()
    if upload_dir not in candidate.parents:
        return
    candidate.unlink(missing_ok=True)
