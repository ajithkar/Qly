"""Repositories for identity: end users, vendor staff, platform admins, tenants,
and refresh-token records."""
from __future__ import annotations

from datetime import timedelta
from typing import Any, Dict, List, Optional

from app.core.security import hash_opaque_token, utcnow
from app.models.base import serialize, to_object_id, touch
from app.repositories.base import BaseRepository


class TenantRepository(BaseRepository):
    collection_name = "tenants"
    tenant_scoped = False
    searchable_fields = ("company_name", "owner_email", "slug")

    async def get_by_email(self, email: str) -> Optional[dict]:
        return serialize(await self.collection.find_one({"owner_email": email.lower()}))

    async def get_by_slug(self, slug: str) -> Optional[dict]:
        return serialize(await self.collection.find_one({"slug": slug}))


class UserRepository(BaseRepository):
    """End users. Google OAuth only - no password is ever stored."""

    collection_name = "users"
    tenant_scoped = False
    searchable_fields = ("name", "email")

    async def get_by_email(self, email: str) -> Optional[dict]:
        return serialize(await self.collection.find_one({"email": email.lower()}))

    async def get_by_google_sub(self, sub: str) -> Optional[dict]:
        return serialize(await self.collection.find_one({"google_sub": sub}))

    async def upsert_google_user(self, profile: Dict[str, Any]) -> dict:
        """Create on first sign-in, otherwise refresh the cached profile."""
        now = utcnow()
        doc = await self.collection.find_one_and_update(
            {"google_sub": profile["sub"]},
            {
                "$set": {
                    "email": profile["email"].lower(),
                    "name": profile.get("name"),
                    "picture": profile.get("picture"),
                    "last_login_at": now,
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "google_sub": profile["sub"],
                    "status": "active",
                    "date_of_birth": None,
                    "created_at": now,
                    "is_deleted": False,
                },
            },
            upsert=True,
            return_document=True,
        )
        return serialize(doc)


class StaffRepository(BaseRepository):
    """Vendor-side principals. Owners are staff with role='owner'."""

    collection_name = "staff"
    searchable_fields = ("name", "email")

    async def get_by_email(self, tenant_id: str, email: str) -> Optional[dict]:
        return await self.find_one({"email": email.lower()}, tenant_id)

    async def get_by_provider_id(self, tenant_id: str, provider_id: str) -> Optional[dict]:
        """The staff login (role=provider) linked to a catalog Provider record."""
        return await self.find_one({"provider_id": provider_id, "role": "provider"}, tenant_id)

    async def get_by_email_any_tenant(self, email: str) -> Optional[dict]:
        return serialize(
            await self.collection.find_one({"email": email.lower(), "is_deleted": False})
        )

    async def get_by_id_any_tenant(self, staff_id: str) -> Optional[dict]:
        """Look up a staff record when the tenant is not yet known.

        Authentication is the one place this is legitimate: the tenant is a
        property *of* the record we are resolving, so it cannot be a filter on
        the query that finds it. Every other read stays tenant-scoped.
        """
        return serialize(
            await self.collection.find_one(
                {"_id": to_object_id(staff_id), "is_deleted": False}
            )
        )

    async def get_by_invite_token(self, raw_token: str) -> Optional[dict]:
        return serialize(
            await self.collection.find_one(
                {
                    "invite_token_hash": hash_opaque_token(raw_token),
                    "invite_expires_at": {"$gt": utcnow()},
                    "is_deleted": False,
                }
            )
        )

    async def get_by_reset_token(self, raw_token: str) -> Optional[dict]:
        return serialize(
            await self.collection.find_one(
                {
                    "reset_token_hash": hash_opaque_token(raw_token),
                    "reset_expires_at": {"$gt": utcnow()},
                    "is_deleted": False,
                }
            )
        )

    async def get_by_verification_token(self, raw_token: str) -> Optional[dict]:
        return serialize(
            await self.collection.find_one(
                {
                    "verification_token_hash": hash_opaque_token(raw_token),
                    "is_deleted": False,
                }
            )
        )

    async def set_tokens(self, staff_id: str, updates: Dict[str, Any]) -> None:
        await self.collection.update_one(
            {"_id": to_object_id(staff_id)}, {"$set": {**updates, **touch()}}
        )

    async def count_active(self, tenant_id: str) -> int:
        return await self.count(tenant_id, {"status": {"$ne": "suspended"}})


class AdminRepository(BaseRepository):
    collection_name = "admins"
    tenant_scoped = False
    searchable_fields = ("name", "email")

    async def get_by_email(self, email: str) -> Optional[dict]:
        return serialize(await self.collection.find_one({"email": email.lower()}))


class RefreshTokenRepository(BaseRepository):
    """Server-side refresh token records so tokens can be revoked.

    Rotation with family tracking: reusing an already-rotated token revokes the
    whole family, which is the standard defence against token replay.
    """

    collection_name = "refresh_tokens"
    tenant_scoped = False
    soft_delete = False

    async def store(
        self,
        *,
        raw_token: str,
        subject: str,
        principal_type: str,
        family: str,
        ttl_days: int,
    ) -> None:
        await self.collection.insert_one(
            {
                "token_hash": hash_opaque_token(raw_token),
                "subject": subject,
                "principal_type": principal_type,
                "family": family,
                "revoked": False,
                "created_at": utcnow(),
                "expires_at": utcnow() + timedelta(days=ttl_days),
            }
        )

    async def get(self, raw_token: str) -> Optional[dict]:
        return serialize(
            await self.collection.find_one({"token_hash": hash_opaque_token(raw_token)})
        )

    async def revoke(self, raw_token: str) -> None:
        await self.collection.update_one(
            {"token_hash": hash_opaque_token(raw_token)}, {"$set": {"revoked": True}}
        )

    async def revoke_family(self, family: str) -> None:
        await self.collection.update_many({"family": family}, {"$set": {"revoked": True}})

    async def revoke_all_for_subject(self, subject: str) -> None:
        await self.collection.update_many({"subject": subject}, {"$set": {"revoked": True}})
