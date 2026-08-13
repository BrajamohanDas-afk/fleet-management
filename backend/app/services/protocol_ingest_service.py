"""Bridge decoded protocol-layer telemetry into the normal ingest pipeline."""

import asyncio
import json
from contextlib import suppress
from datetime import datetime, timezone

from app.core.database import AsyncSessionLocal
from app.core.redis import get_redis_client
from app.repositories import device_repository
from app.services.telemetry_service import ingest_telemetry

_task: asyncio.Task[None] | None = None


def _recorded_at(value: object) -> datetime:
    if isinstance(value, str):
        with suppress(ValueError):
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc)


async def _consume() -> None:
    redis = get_redis_client()
    pubsub = redis.pubsub()
    await pubsub.subscribe("protocol.telemetry")
    try:
        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue
            try:
                payload = json.loads(message["data"])
                device_serial = str(payload["device_id"])
                latitude = float(payload["latitude"])
                longitude = float(payload["longitude"])
            except (KeyError, TypeError, ValueError, json.JSONDecodeError):
                continue

            async with AsyncSessionLocal() as db:
                device = await device_repository.get_by_serial(db, device_serial)
                if device is None:
                    continue
                await ingest_telemetry(
                    db, redis, device.id, _recorded_at(payload.get("timestamp")),
                    latitude, longitude,
                    float(payload["speed_kmh"]) if payload.get("speed_kmh") is not None else None,
                    None, None,
                )
                await db.commit()
    finally:
        await pubsub.unsubscribe("protocol.telemetry")
        await pubsub.close()


def start() -> None:
    global _task
    if _task is None or _task.done():
        _task = asyncio.create_task(_consume())


async def stop() -> None:
    global _task
    if _task is not None:
        _task.cancel()
        with suppress(asyncio.CancelledError):
            await _task
        _task = None
