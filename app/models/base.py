"""Shared model primitives: ObjectId handling, audit fields, soft deletion."""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Optional

from bson import ObjectId
from bson.errors import InvalidId
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

from app.core.security import utcnow


def _validate_object_id(v: Any) -> str:
    """Accept ObjectId or str, always return str for transport."""
    if isinstance(v, ObjectId):
        return str(v)
    if isinstance(v, str) and ObjectId.is_valid(v):
        return v
    raise ValueError("Invalid identifier.")


PyObjectId = Annotated[str, BeforeValidator(_validate_object_id)]


def to_object_id(value: str, field: str = "id") -> ObjectId:
    """Convert a client-supplied string to ObjectId, raising a clean error."""
    from app.core.errors import ValidationError  # local import avoids a cycle

    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise ValidationError(
            "Invalid identifier.", details=[{"field": field, "message": "Malformed id."}]
        )


class MongoModel(BaseModel):
    """Base for documents returned to clients."""

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str},
    )

    id: Optional[PyObjectId] = Field(default=None, alias="_id")


class AuditFields(BaseModel):
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None


def new_audit(actor_id: Optional[str] = None) -> dict:
    """Audit fields for a freshly created document."""
    now = utcnow()
    return {
        "created_at": now,
        "updated_at": now,
        "created_by": actor_id,
        "updated_by": actor_id,
        "is_deleted": False,
        "deleted_at": None,
    }


def touch(actor_id: Optional[str] = None) -> dict:
    """Audit fields for an update."""
    return {"updated_at": utcnow(), "updated_by": actor_id}


def serialize(doc: Optional[dict]) -> Optional[dict]:
    """Convert Mongo's _id/ObjectId values into JSON-safe strings."""
    if doc is None:
        return None
    out = dict(doc)
    if "_id" in out:
        out["id"] = str(out.pop("_id"))
    for key, value in out.items():
        if isinstance(value, ObjectId):
            out[key] = str(value)
    return out
