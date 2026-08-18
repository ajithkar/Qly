"""MongoDB connection lifecycle (Motor, fully async)."""
from __future__ import annotations

from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_client: Optional[AsyncIOMotorClient] = None
_db: Optional[AsyncIOMotorDatabase] = None


async def connect_to_mongo() -> None:
    global _client, _db
    _client = AsyncIOMotorClient(
        settings.MONGODB_URI,
        uuidRepresentation="standard",
        serverSelectionTimeoutMS=10_000,
        connectTimeoutMS=10_000,
    )
    _db = _client[settings.MONGODB_DB_NAME]
    try:
        await _client.admin.command("ping")
    except Exception as exc:
        logger.error(
            "mongo_connection_failed",
            extra={"error_type": type(exc).__name__, "error": str(exc)},
        )
        _client.close()
        _client = None
        _db = None
        raise
    logger.info("mongo_connected", extra={"database": settings.MONGODB_DB_NAME})


async def close_mongo_connection() -> None:
    global _client, _db
    if _client is not None:
        _client.close()
        _client = None
        _db = None
        logger.info("mongo_disconnected")


def get_database() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("MongoDB is not initialised. Call connect_to_mongo() first.")
    return _db


async def mongo_healthy() -> bool:
    try:
        if _client is None:
            return False
        await _client.admin.command("ping")
        return True
    except Exception:  # noqa: BLE001 - health check must never raise
        return False
