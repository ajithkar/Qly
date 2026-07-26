"""Redis: caching, rate limiting, distributed locks, idempotency, WS pub/sub."""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator, Optional

import redis.asyncio as aioredis

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_redis: Optional[aioredis.Redis] = None

# Release a lock only if we still own it (compare-and-delete).
_UNLOCK_SCRIPT = """
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
"""


async def connect_to_redis() -> None:
    global _redis
    _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    await _redis.ping()
    logger.info("redis_connected")


async def close_redis_connection() -> None:
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None
        logger.info("redis_disconnected")


def get_redis() -> aioredis.Redis:
    if _redis is None:
        raise RuntimeError("Redis is not initialised. Call connect_to_redis() first.")
    return _redis


async def redis_healthy() -> bool:
    try:
        if _redis is None:
            return False
        await _redis.ping()
        return True
    except Exception:  # noqa: BLE001
        return False


@asynccontextmanager
async def distributed_lock(
    key: str, *, ttl_seconds: int = 10, wait: bool = False
) -> AsyncIterator[bool]:
    """Best-effort distributed lock for cross-document coordination.

    Single-document contention should use atomic Mongo operators instead;
    this exists for operations that span several documents.
    """
    client = get_redis()
    token = str(uuid.uuid4())
    lock_key = f"lock:{key}"
    acquired = await client.set(lock_key, token, nx=True, ex=ttl_seconds)
    try:
        yield bool(acquired)
    finally:
        if acquired:
            try:
                await client.eval(_UNLOCK_SCRIPT, 1, lock_key, token)
            except Exception:  # noqa: BLE001 - never mask the original error
                logger.warning("lock_release_failed", extra={"lock_key": lock_key})
