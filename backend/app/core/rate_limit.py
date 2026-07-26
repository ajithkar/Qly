"""Rate limiting and brute-force lockout, backed by Redis.

Two distinct protections:
  * rate limiting  — caps request volume per IP/principal per minute.
  * login guard    — locks an account after repeated failed passwords, so a
                     slow credential-stuffing attack cannot hide under the
                     per-minute request cap.
"""
from __future__ import annotations

import hashlib
from contextlib import asynccontextmanager
from typing import AsyncIterator, Optional

from fastapi import Depends, Request

from app.core.config import settings
from app.core.errors import AuthenticationError, RateLimited
from app.core.logging import get_logger

logger = get_logger(__name__)


def _key(*parts: str) -> str:
    raw = ":".join(parts)
    return "rl:" + hashlib.sha256(raw.encode()).hexdigest()[:32]


async def _hit(bucket: str, limit: int, window_seconds: int = 60) -> None:
    """Fixed-window counter. Fails open if Redis is unavailable — availability
    matters more than perfect enforcement for this control."""
    if not settings.RATE_LIMIT_ENABLED:
        return
    from app.db.redis_client import get_redis

    try:
        redis = get_redis()
        count = await redis.incr(bucket)
        if count == 1:
            await redis.expire(bucket, window_seconds)
        if count > limit:
            raise RateLimited()
    except RateLimited:
        raise
    except Exception:  # noqa: BLE001
        logger.warning("rate_limit_unavailable")


def _identity(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def default_rate_limit(request: Request) -> None:
    await _hit(
        _key("default", _identity(request), request.url.path),
        settings.RATE_LIMIT_DEFAULT_PER_MINUTE,
    )


async def auth_rate_limit(request: Request) -> None:
    """Tighter limit on authentication endpoints."""
    await _hit(
        _key("auth", _identity(request)),
        settings.RATE_LIMIT_AUTH_PER_MINUTE,
    )


@asynccontextmanager
async def login_guard(identifier: str) -> AsyncIterator[None]:
    """Lock an identifier out after repeated failures.

    Usage:
        async with login_guard(email):
            ... verify credentials, raising on failure ...
    A successful exit clears the counter; an AuthenticationError increments it.
    """
    from app.db.redis_client import get_redis

    bucket = _key("login", identifier.lower())
    redis = None
    try:
        redis = get_redis()
        attempts = await redis.get(bucket)
        if attempts and int(attempts) >= settings.LOGIN_MAX_ATTEMPTS:
            raise AuthenticationError(
                "Too many failed sign-in attempts. Please try again later.",
                code="account_locked",
            )
    except AuthenticationError:
        raise
    except Exception:  # noqa: BLE001 - never block login because Redis is down
        redis = None

    try:
        yield
    except AuthenticationError:
        if redis is not None:
            try:
                count = await redis.incr(bucket)
                if count == 1:
                    await redis.expire(bucket, settings.LOGIN_LOCKOUT_SECONDS)
            except Exception:  # noqa: BLE001
                pass
        raise
    else:
        if redis is not None:
            try:
                await redis.delete(bucket)
            except Exception:  # noqa: BLE001
                pass
