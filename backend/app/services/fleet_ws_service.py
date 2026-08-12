import asyncio
import json
import logging
from typing import Set

from fastapi import WebSocket
from redis.asyncio import Redis

from app.core.redis import get_redis_client

logger = logging.getLogger(__name__)

TELEMETRY_CHANNEL = "fleet:telemetry"
LATEST_HASH = "fleet:latest"

_connections: Set[WebSocket] = set()
_listener_task: asyncio.Task | None = None
_lock = asyncio.Lock()


async def _broadcast(message: dict) -> None:
    """Send a JSON message to every active WebSocket, pruning dead ones."""
    if not _connections:
        return

    text = json.dumps(message)
    dead: Set[WebSocket] = set()
    for ws in list(_connections):
        try:
            await ws.send_text(text)
        except Exception:  # noqa: BLE001
            dead.add(ws)

    for ws in dead:
        _connections.discard(ws)


async def _listener(redis: Redis) -> None:
    """Listen to Redis pub/sub and fan telemetry updates out to clients."""
    pubsub = redis.pubsub()
    try:
        await pubsub.subscribe(TELEMETRY_CHANNEL)
        async for msg in pubsub.listen():
            if msg.get("type") != "message":
                continue

            try:
                envelope = json.loads(msg["data"])
            except (json.JSONDecodeError, TypeError):
                continue

            vehicle_id = envelope.get("vehicle_id")
            if vehicle_id is None:
                continue

            latest_raw = await redis.hget(LATEST_HASH, str(vehicle_id))
            if latest_raw is None:
                continue

            try:
                latest = json.loads(latest_raw)
            except json.JSONDecodeError:
                continue

            await _broadcast({"type": "update", "data": latest})
    except asyncio.CancelledError:
        logger.debug("Fleet WebSocket listener cancelled")
        raise
    finally:
        try:
            await pubsub.unsubscribe(TELEMETRY_CHANNEL)
            await pubsub.close()
        except Exception:  # noqa: BLE001
            pass


async def _ensure_listener(redis: Redis) -> None:
    """Start a single Redis pub/sub listener task for this process."""
    global _listener_task
    async with _lock:
        if _listener_task is None or _listener_task.done():
            _listener_task = asyncio.create_task(_listener(redis))


async def register_connection(
    ws: WebSocket,
    redis: Redis | None = None,
) -> None:
    """Track a WebSocket and make sure the Redis fan-out task is running."""
    _connections.add(ws)
    await _ensure_listener(redis or get_redis_client())


async def unregister_connection(ws: WebSocket) -> None:
    """Remove a WebSocket and stop the fan-out task when none remain."""
    global _listener_task
    _connections.discard(ws)
    if not _connections and _listener_task is not None and not _listener_task.done():
        _listener_task.cancel()
        try:
            await _listener_task
        except asyncio.CancelledError:
            pass
        _listener_task = None


def active_connections_count() -> int:
    return len(_connections)


async def stop() -> None:
    """Cancel the listener and drop all tracked connections (test helper)."""
    global _listener_task
    async with _lock:
        if _listener_task is not None and not _listener_task.done():
            _listener_task.cancel()
            try:
                await _listener_task
            except asyncio.CancelledError:
                pass
        _listener_task = None
    _connections.clear()
