from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.device import Device
from app.models.device_channel import DeviceChannel
from app.schemas.device import DeviceChannelHealthOut, DeviceChannelOut

STALE_FRAME_SECONDS = 3
OFFLINE_FRAME_SECONDS = 10


def build_stream_url(stream_path: str | None) -> str | None:
    if not stream_path:
        return None
    host = settings.MEDIAMTX_HOST
    port = settings.MEDIAMTX_HTTP_PORT
    return f"http://{host}:{port}/{stream_path}/whep"


def build_rtsp_url(stream_path: str | None) -> str | None:
    if not stream_path:
        return None
    host = settings.MEDIAMTX_HOST
    port = settings.MEDIAMTX_RTSP_PORT
    return f"rtsp://{host}:{port}/{stream_path}"


async def get_device_channels(
    db: AsyncSession, device_id: int
) -> list[DeviceChannelOut]:
    result = await db.execute(
        select(DeviceChannel)
        .where(DeviceChannel.device_id == device_id)
        .order_by(DeviceChannel.channel_no)
    )
    channels = result.scalars().all()
    return [
        DeviceChannelOut(
            id=ch.id,
            device_id=ch.device_id,
            channel_no=ch.channel_no,
            label=ch.label,
            stream_path=ch.stream_path,
            stream_url=build_stream_url(ch.stream_path),
        )
        for ch in channels
    ]


def _parse_mediamtx_last_frame(data: dict[str, Any]) -> datetime | None:
    # MediaMTX v3 may return lastFrameTime as an ISO string or a timestamp.
    last_frame = data.get("lastFrameTime") or data.get("last_frame_time")
    if not last_frame:
        return None
    if isinstance(last_frame, str):
        try:
            # Try parsing ISO format with timezone.
            return datetime.fromisoformat(last_frame.replace("Z", "+00:00"))
        except ValueError:
            return None
    if isinstance(last_frame, (int, float)):
        # Assume seconds since epoch.
        return datetime.fromtimestamp(last_frame, tz=timezone.utc)
    return None


def _derive_channel_state(
    last_frame_at: datetime | None, fallback_now: datetime
) -> str:
    if last_frame_at is None:
        return "idle"
    age = (fallback_now - last_frame_at).total_seconds()
    if age < STALE_FRAME_SECONDS:
        return "live"
    if age < OFFLINE_FRAME_SECONDS:
        return "degraded"
    return "offline"


async def _query_mediamtx_path_info(stream_path: str) -> dict[str, Any] | None:
    base = f"http://{settings.MEDIAMTX_HOST}:{settings.MEDIAMTX_HTTP_PORT}"
    endpoints = [
        f"{base}/v3/paths/get/{stream_path}",
        f"{base}/v3/config/paths/get/{stream_path}",
    ]
    async with httpx.AsyncClient(timeout=5.0) as client:
        for url in endpoints:
            try:
                response = await client.get(url)
                if response.status_code == 200:
                    return response.json()
            except httpx.HTTPError:
                continue
    return None


async def _get_last_frame_from_redis(
    redis: Redis, stream_path: str
) -> datetime | None:
    raw = await redis.hget("fleet:frame:latest", stream_path)
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


async def get_channel_health(
    db: AsyncSession,
    redis: Redis,
    device_id: int,
) -> list[DeviceChannelHealthOut]:
    result = await db.execute(
        select(DeviceChannel)
        .where(DeviceChannel.device_id == device_id)
        .order_by(DeviceChannel.channel_no)
    )
    channels = result.scalars().all()
    now = datetime.now(timezone.utc)

    health_items: list[DeviceChannelHealthOut] = []
    for ch in channels:
        last_frame_at: datetime | None = None
        state = "idle"

        if ch.stream_path:
            path_info = await _query_mediamtx_path_info(ch.stream_path)
            if path_info is not None:
                # Response may be wrapped in "item" key.
                data = path_info.get("item", path_info)
                last_frame_at = _parse_mediamtx_last_frame(data)
                if last_frame_at is None:
                    # If the path exists but has no frames yet, treat as idle.
                    bytes_received = data.get("bytesReceived") or data.get("bytes_received") or 0
                    state = "idle" if bytes_received == 0 else "degraded"
                else:
                    state = _derive_channel_state(last_frame_at, now)
            else:
                # MediaMTX API unavailable: fall back to Redis timestamp.
                last_frame_at = await _get_last_frame_from_redis(redis, ch.stream_path)
                state = _derive_channel_state(last_frame_at, now)
                if state == "live":
                    # Without direct path info we cannot be confident it is live.
                    state = "degraded"

        health_items.append(
            DeviceChannelHealthOut(
                channel_no=ch.channel_no,
                label=ch.label,
                state=state,
                last_frame_at=last_frame_at,
            )
        )

    return health_items
