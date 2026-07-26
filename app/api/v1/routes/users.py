"""End-user authentication (Google only), profile, notifications, data rights."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.deps import get_current_user, get_db
from app.core.errors import NotFound
from app.core.rate_limit import auth_rate_limit
from app.core.security import utcnow
from app.repositories.identity import RefreshTokenRepository, UserRepository
from app.schemas.auth import GoogleCallbackRequest, UserProfileUpdate
from app.schemas.common import PaginationParams, ok, pagination_params, paginate
from app.services.auth_service import AuthService
from app.services.google_oauth import GoogleOAuthService

router = APIRouter(tags=["end-users"])


@router.get("/me/profile")
async def get_profile(
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Full profile, including fields /auth/me deliberately omits (picture,
    date of birth) because that endpoint is shared across all principal
    types."""
    profile = await UserRepository(db).get_by_id(user["id"])
    if not profile:
        raise NotFound("Profile not found.")
    profile.pop("google_sub", None)
    return ok(profile)


@router.get("/auth/google/login")
async def google_login(_: None = Depends(auth_rate_limit)) -> Dict[str, Any]:
    return ok(await GoogleOAuthService().authorization_url())


@router.post("/auth/google/callback")
async def google_callback(
    payload: GoogleCallbackRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: None = Depends(auth_rate_limit),
) -> Dict[str, Any]:
    profile = await GoogleOAuthService().exchange_code(payload.code, payload.state or "")
    user, tokens = await AuthService(db).login_google_user(profile)
    return ok({**tokens, "user": {"id": user["id"], "name": user.get("name")}})


@router.patch("/me/profile")
async def update_profile(
    payload: UserProfileUpdate,
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    updated = await UserRepository(db).update(
        user["id"], payload.model_dump(mode="json", exclude_none=True), actor_id=user["id"]
    )
    return ok({"id": updated["id"], "name": updated.get("name"), "date_of_birth": updated.get("date_of_birth")})


@router.get("/me/notifications")
async def my_notifications(
    params: PaginationParams = Depends(pagination_params),
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    query = {"recipient_id": user["id"]}
    total = await db["notifications"].count_documents(query)
    cursor = (
        db["notifications"]
        .find(query)
        .sort("created_at", -1)
        .skip(params.skip)
        .limit(params.page_size)
    )
    from app.models.base import serialize

    items = [serialize(d) for d in await cursor.to_list(length=params.page_size)]
    return paginate(items, total, params)


@router.post("/me/notifications/{notification_id}/read")
async def mark_read(
    notification_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    from app.models.base import to_object_id

    result = await db["notifications"].update_one(
        {"_id": to_object_id(notification_id), "recipient_id": user["id"]},
        {"$set": {"read": True, "read_at": utcnow()}},
    )
    return ok({"updated": result.modified_count > 0})


@router.get("/me/preferences")
async def get_preferences(
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    doc = await db["notification_preferences"].find_one({"recipient_id": user["id"]}) or {}
    return ok(
        {
            "email_enabled": doc.get("email_enabled", True),
            "sms_enabled": doc.get("sms_enabled", False),
            "quiet_hours": doc.get("quiet_hours"),
        }
    )


@router.patch("/me/preferences")
async def update_preferences(
    preferences: Dict[str, Any],
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Notification channel toggles and quiet hours."""
    allowed = {"email_enabled", "sms_enabled", "quiet_hours"}
    clean = {k: v for k, v in preferences.items() if k in allowed}
    await db["notification_preferences"].update_one(
        {"recipient_id": user["id"]},
        {"$set": {**clean, "recipient_id": user["id"], "email": user.get("email")}},
        upsert=True,
    )
    return ok({"updated": True})


@router.post("/me/export")
async def export_my_data(
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """GDPR/DSAR self-service export."""
    from app.models.base import serialize

    async def collect(collection: str, field: str = "user_id") -> list:
        cursor = db[collection].find({field: user["id"]}).limit(1000)
        return [serialize(d) for d in await cursor.to_list(length=1000)]

    return ok(
        {
            "profile": {
                "id": user["id"],
                "email": user.get("email"),
                "name": user.get("name"),
                "date_of_birth": user.get("date_of_birth"),
            },
            "appointments": await collect("appointments"),
            "queue_tokens": await collect("queue_tokens"),
            "notifications": await collect("notifications", "recipient_id"),
            "exported_at": utcnow(),
        }
    )


@router.post("/me/delete-request")
async def request_account_deletion(
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Soft-delete and anonymise, retaining only what billing/audit requires."""
    await UserRepository(db).update(
        user["id"],
        {
            "status": "suspended",
            "deletion_requested_at": utcnow(),
            "name": "Deleted user",
            "picture": None,
        },
        actor_id=user["id"],
    )
    await RefreshTokenRepository(db).revoke_all_for_subject(user["id"])
    return ok(
        {
            "deletion_requested": True,
            "message": "Your account has been deactivated and your profile anonymised.",
        }
    )
