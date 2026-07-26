"""Liveness and readiness probes, plus the metrics that back the admin
'System Health' KPI card."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, Response, status

from app.api.deps import get_current_admin
from app.core.config import settings
from app.core.security import utcnow
from app.db.mongo import mongo_healthy
from app.db.redis_client import redis_healthy
from app.schemas.common import ok
from app.websocket.manager import ws_manager

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> Dict[str, Any]:
    """Liveness: is the process up? Deliberately dependency-free."""
    return {
        "status": "ok",
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
    }


@router.get("/ready")
async def ready(response: Response) -> Dict[str, Any]:
    """Readiness: can the process actually serve traffic?"""
    mongo_ok = await mongo_healthy()
    redis_ok = await redis_healthy()
    healthy = mongo_ok and redis_ok
    if not healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "status": "ready" if healthy else "degraded",
        "checks": {"mongodb": mongo_ok, "redis": redis_ok},
        "checked_at": utcnow().isoformat(),
    }


@router.get("/admin/system-health")
async def system_health(
    _: Dict[str, Any] = Depends(get_current_admin),
) -> Dict[str, Any]:
    """Real metrics for the Super Admin dashboard - no mock values."""
    from app.core.metrics import metrics

    mongo_ok = await mongo_healthy()
    redis_ok = await redis_healthy()
    return ok(
        {
            "mongodb": "healthy" if mongo_ok else "down",
            "redis": "healthy" if redis_ok else "down",
            "websocket_connections": ws_manager.local_connection_count(),
            "api_requests_total": metrics.request_count,
            "api_errors_total": metrics.error_count,
            "average_latency_ms": metrics.average_latency_ms,
            "uptime_seconds": metrics.uptime_seconds,
            "version": settings.APP_VERSION,
        }
    )
