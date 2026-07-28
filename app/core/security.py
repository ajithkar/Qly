"""Password hashing, token generation, and JWT encode/decode."""
from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import bcrypt
import jwt

from app.core.config import settings
from app.core.errors import AuthenticationError, ValidationError

# bcrypt operates on at most 72 bytes; anything longer is silently ignored by
# the algorithm, so we truncate explicitly rather than let it happen invisibly.
_BCRYPT_MAX_BYTES = 72

ACCESS = "access"
REFRESH = "refresh"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(value: Any) -> datetime:
    """Normalise a value read back from MongoDB to an aware UTC datetime.

    The driver returns naive datetimes, so arithmetic against utcnow() would
    otherwise raise a TypeError.
    """
    if isinstance(value, str):
        value = datetime.fromisoformat(value)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


# --------------------------------------------------------------------------
# Passwords
# --------------------------------------------------------------------------
def _to_bcrypt_bytes(plain: str) -> bytes:
    return plain.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(_to_bcrypt_bytes(plain), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    if not plain or not hashed:
        return False
    try:
        return bcrypt.checkpw(_to_bcrypt_bytes(plain), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def validate_password_strength(password: str) -> None:
    """Enforce the platform password policy. Raises ValidationError."""
    problems = []
    if len(password) < settings.PASSWORD_MIN_LENGTH:
        problems.append(f"Must be at least {settings.PASSWORD_MIN_LENGTH} characters.")
    if not any(c.islower() for c in password):
        problems.append("Must contain a lowercase letter.")
    if not any(c.isupper() for c in password):
        problems.append("Must contain an uppercase letter.")
    if not any(c.isdigit() for c in password):
        problems.append("Must contain a digit.")
    if problems:
        raise ValidationError(
            "Password does not meet the security policy.",
            details=[{"field": "password", "message": m} for m in problems],
        )


# --------------------------------------------------------------------------
# Opaque tokens (email verification, invites, password reset, refresh handles)
# --------------------------------------------------------------------------
def generate_opaque_token() -> str:
    return secrets.token_urlsafe(48)


def hash_opaque_token(token: str) -> str:
    """Store only the hash, so a DB leak does not yield usable tokens."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_numeric_code(length: int = 6) -> str:
    """A short code a person can read aloud or retype - console share OTPs."""
    return "".join(str(secrets.randbelow(10)) for _ in range(length))


_PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"


def generate_temp_password(length: int = 14) -> str:
    """A random password for a vendor whose payment just activated their
    account. Excludes visually-ambiguous characters (0/O, 1/l/I) since a
    human may need to retype it from an email."""
    return "".join(secrets.choice(_PASSWORD_ALPHABET) for _ in range(length))


# --------------------------------------------------------------------------
# JWT
# --------------------------------------------------------------------------
def _encode(payload: Dict[str, Any], expires_delta: timedelta, token_type: str) -> str:
    now = utcnow()
    to_encode = {
        **payload,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
        "jti": str(uuid.uuid4()),
        "type": token_type,
    }
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_access_token(
    *,
    subject: str,
    principal_type: str,
    tenant_id: Optional[str] = None,
    role: Optional[str] = None,
) -> str:
    """Access tokens carry identity only. Permissions are resolved server-side
    on every request so a role change takes effect immediately."""
    payload: Dict[str, Any] = {"sub": subject, "principal_type": principal_type}
    if tenant_id:
        payload["tenant_id"] = tenant_id
    if role:
        payload["role"] = role
    return _encode(payload, timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES), ACCESS)


def create_refresh_token(*, subject: str, principal_type: str, family_id: str) -> str:
    return _encode(
        {"sub": subject, "principal_type": principal_type, "family": family_id},
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        REFRESH,
    )


def decode_token(token: str, *, expected_type: str) -> Dict[str, Any]:
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
    except jwt.ExpiredSignatureError:
        raise AuthenticationError("Token has expired.", code="token_expired")
    except jwt.InvalidTokenError:
        raise AuthenticationError("Token is invalid.", code="token_invalid")

    if payload.get("type") != expected_type:
        raise AuthenticationError("Token type mismatch.", code="token_invalid")
    return payload
