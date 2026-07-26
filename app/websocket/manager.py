"""WebSocket connection manager with Redis pub/sub fan-out.

Local connections are tracked in-process, but every broadcast is published to
Redis so instances behind the load balancer all deliver the message. Without
this, horizontal scaling silently breaks real-time updates - a client connected
to instance B would never see an event raised on instance A.
"""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from typing import Any, DefaultDict, Dict, Optional, Set

from fastapi import WebSocket

from app.core.logging import get_logger

logger = get_logger(__name__)

CHANNEL_PREFIX = "qly:ws:"


class WebSocketManager:
    def __init__(self) -> None:
        self._connections: DefaultDict[str, Set[WebSocket]] = defaultdict(set)
        self._pubsub_task: Optional[asyncio.Task] = None
        self._pubsub = None
        self._lock = asyncio.Lock()

    # -- lifecycle -------------------------------------------------------
    async def start(self) -> None:
        """Subscribe to the fan-out channel pattern."""
        from app.db.redis_client import get_redis

        try:
            redis = get_redis()
            self._pubsub = redis.pubsub()
            await self._pubsub.psubscribe(f"{CHANNEL_PREFIX}*")
            self._pubsub_task = asyncio.create_task(self._listen())
            logger.info("ws_pubsub_started")
        except Exception:  # noqa: BLE001 - app must still boot without Redis
            logger.warning("ws_pubsub_unavailable")

    async def stop(self) -> None:
        if self._pubsub_task:
            self._pubsub_task.cancel()
            try:
                await self._pubsub_task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        if self._pubsub:
            try:
                await self._pubsub.aclose()
            except Exception:  # noqa: BLE001
                pass

    async def _listen(self) -> None:
        assert self._pubsub is not None
        async for message in self._pubsub.listen():
            if message.get("type") != "pmessage":
                continue
            channel = message["channel"]
            if channel.startswith(CHANNEL_PREFIX):
                topic = channel[len(CHANNEL_PREFIX):]
                try:
                    payload = json.loads(message["data"])
                except (ValueError, TypeError):
                    continue
                await self._deliver_local(topic, payload)

    # -- connections -----------------------------------------------------
    async def connect(self, topic: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[topic].add(websocket)
        logger.info("ws_connected", extra={"topic": topic})

    async def disconnect(self, topic: str, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections[topic].discard(websocket)
            if not self._connections[topic]:
                self._connections.pop(topic, None)

    # -- delivery --------------------------------------------------------
    async def broadcast(self, topic: str, message: Dict[str, Any]) -> None:
        """Publish to Redis so every instance delivers to its own clients.
        Falls back to local-only delivery if Redis is unavailable."""
        from app.db.redis_client import get_redis

        try:
            redis = get_redis()
            await redis.publish(f"{CHANNEL_PREFIX}{topic}", json.dumps(message, default=str))
        except Exception:  # noqa: BLE001
            await self._deliver_local(topic, message)

    async def _deliver_local(self, topic: str, message: Dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self._connections.get(topic, ()))
        dead = []
        for ws in targets:
            try:
                await ws.send_json(message)
            except Exception:  # noqa: BLE001 - client vanished
                dead.append(ws)
        for ws in dead:
            await self.disconnect(topic, ws)

    def local_connection_count(self) -> int:
        return sum(len(v) for v in self._connections.values())


ws_manager = WebSocketManager()
