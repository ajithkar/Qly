"""WebSocket endpoints for the live queue monitor and personal notifications.

Browsers cannot set an Authorization header on a WebSocket handshake, so the
access token arrives as a query parameter and is validated before the socket
is accepted.
"""
from __future__ import annotations

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.errors import AppError
from app.core.logging import get_logger
from app.core.security import decode_token
from app.db.mongo import get_database
from app.repositories.queues import QueueRepository
from app.services.queue_service import QueueService
from app.websocket.manager import ws_manager

logger = get_logger(__name__)
router = APIRouter()


@router.websocket("/ws/queues/{queue_id}")
async def queue_socket(
    websocket: WebSocket,
    queue_id: str,
    token: str = Query(...),
    tenant_id: str = Query(...),
) -> None:
    try:
        decode_token(token, expected_type="access")
    except AppError:
        await websocket.close(code=4401, reason="Unauthorized")
        return

    db = get_database()
    queue = await QueueRepository(db).get_by_id(queue_id, tenant_id)
    if not queue:
        await websocket.close(code=4404, reason="Queue not found")
        return

    topic = f"queue:{queue_id}"
    await ws_manager.connect(topic, websocket)
    try:
        # Send current state immediately so the client is never briefly empty.
        snapshot = await QueueService(db).live_monitor(tenant_id, queue_id)
        await websocket.send_json({"type": "queue_update", "payload": snapshot})
        while True:
            # Keeps the connection open; also lets clients send ping frames.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        logger.warning("ws_error", extra={"topic": topic})
    finally:
        await ws_manager.disconnect(topic, websocket)


@router.websocket("/ws/notifications")
async def notification_socket(websocket: WebSocket, token: str = Query(...)) -> None:
    try:
        payload = decode_token(token, expected_type="access")
    except AppError:
        await websocket.close(code=4401, reason="Unauthorized")
        return

    topic = f"user:{payload['sub']}"
    await ws_manager.connect(topic, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await ws_manager.disconnect(topic, websocket)
