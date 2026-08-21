import asyncio
from pathlib import Path
from urllib.parse import urlencode

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_redis
from app.core.database import AsyncSessionLocal, get_db
from app.models.device_channel import DeviceChannel
from app.models.video_clip import VideoClip
from app.repositories import device_repository
from app.schemas.device import DeviceChannelHealthOut, DeviceChannelOut, DeviceOut, DeviceUpdate
from app.schemas.recording import RecordingCreate, RecordingOut
from app.services.camera_source_service import SOURCE_FORMAT_WHEP, SOURCE_TYPE_HTTP, is_rtsp_source
from app.services.device_service import get_channel_health, get_device_channels
from app.services.gps_feed_service import sync_gps_feed_config
from app.services.recording_service import (
    finalize_recording,
    run_ffmpeg_recording,
    start_recording,
)
from app.services.stream_command_service import publish_stream_command

router = APIRouter(prefix="/devices", tags=["devices"])


@router.patch("/{device_id}", response_model=DeviceOut)
async def update_device(
    device_id: int,
    payload: DeviceUpdate,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    current_user: dict = Depends(get_current_user),
) -> DeviceOut:
    _ = current_user
    device = await device_repository.get(db, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    updated = await device_repository.update(db, device, payload.model_dump(exclude_unset=True))
    await db.commit()
    await sync_gps_feed_config(redis, updated)
    return DeviceOut.model_validate(updated)


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    current_user: dict = Depends(get_current_user),
) -> None:
    _ = current_user
    device = await device_repository.get(db, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    device.gps_feed_enabled = False
    await sync_gps_feed_config(redis, device)
    await device_repository.delete(db, device)
    await db.commit()


@router.get("/{device_id}/channels", response_model=list[DeviceChannelOut])
async def list_device_channels(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> list[DeviceChannelOut]:
    _ = current_user
    device = await device_repository.get(db, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    return await get_device_channels(db, device_id)


@router.api_route("/{device_id}/channels/{channel_no}/http-stream", methods=["GET", "HEAD"])
async def get_http_camera_stream(
    device_id: int,
    channel_no: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> RedirectResponse:
    _ = current_user
    result = await db.execute(
        select(DeviceChannel).where(
            (DeviceChannel.device_id == device_id)
            & (DeviceChannel.channel_no == channel_no)
        )
    )
    channel = result.scalar_one_or_none()
    if channel is None:
        raise HTTPException(status_code=404, detail="Camera channel not found")
    if (channel.source_type or "rtsp").lower() != SOURCE_TYPE_HTTP or not channel.rtsp_url:
        raise HTTPException(status_code=400, detail="Camera channel is not an HTTP/HTTPS source")

    source_format = (channel.source_format or "auto").lower().replace("direct_video", "video")
    if source_format == "rtsp":
        source_format = "auto"
    if source_format == SOURCE_FORMAT_WHEP:
        return RedirectResponse(url=channel.rtsp_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    query = urlencode({"url": channel.rtsp_url, "format": source_format})
    return RedirectResponse(url=f"/camera-relay/proxy?{query}", status_code=status.HTTP_307_TEMPORARY_REDIRECT)

@router.get("/{device_id}/health", response_model=list[DeviceChannelHealthOut])
async def get_device_health(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    current_user: dict = Depends(get_current_user),
) -> list[DeviceChannelHealthOut]:
    _ = current_user
    device = await device_repository.get(db, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    return await get_channel_health(db, redis, device_id)


@router.post("/{device_id}/streams/start", status_code=status.HTTP_202_ACCEPTED)
async def start_device_streams(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    current_user: dict = Depends(get_current_user),
) -> dict[str, int]:
    _ = current_user
    device = await device_repository.get(db, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    if device.vehicle_id is None:
        raise HTTPException(status_code=400, detail="Device is not assigned to a vehicle")

    result = await db.execute(
        select(DeviceChannel)
        .where(DeviceChannel.device_id == device_id)
        .order_by(DeviceChannel.channel_no)
    )
    channels = result.scalars().all()
    started = 0
    for channel in channels:
        if not channel.rtsp_url or not is_rtsp_source(channel.source_type):
            continue
        await publish_stream_command(
            redis,
            action="start",
            vehicle_id=device.vehicle_id,
            channel_no=channel.channel_no,
            rtsp_url=channel.rtsp_url,
        )
        started += 1

    return {"started": started}


async def _record_and_finalize(
    clip_id: int,
    device_id: int,
    channel_no: int,
    duration_s: int,
) -> None:
    async with AsyncSessionLocal() as db:
        clip = await db.get(VideoClip, clip_id)
        if clip is None:
            return

        result = await db.execute(
            select(DeviceChannel).where(
                (DeviceChannel.device_id == device_id)
                & (DeviceChannel.channel_no == channel_no)
            )
        )
        channel = result.scalar_one_or_none()
        if channel and channel.stream_path and is_rtsp_source(channel.source_type) and clip.file_path:
            await asyncio.to_thread(
                run_ffmpeg_recording,
                Path(clip.file_path),
                channel.stream_path,
                duration_s,
            )

        await finalize_recording(db, clip_id)
        await db.commit()


@router.post(
    "/{device_id}/recordings",
    response_model=RecordingOut,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_device_recording(
    device_id: int,
    payload: RecordingCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> RecordingOut:
    _ = current_user
    device = await device_repository.get(db, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")

    result = await db.execute(
        select(DeviceChannel).where(
            (DeviceChannel.device_id == device_id)
            & (DeviceChannel.channel_no == payload.channel_no)
        )
    )
    channel = result.scalar_one_or_none()
    if channel is None:
        raise HTTPException(status_code=404, detail="Camera channel not found")
    if not is_rtsp_source(channel.source_type):
        raise HTTPException(status_code=400, detail="Recording is available for RTSP cameras only")

    clip = await start_recording(
        db,
        device_id=device_id,
        channel_no=payload.channel_no,
        duration_s=payload.duration_s,
    )
    await db.commit()
    await db.refresh(clip)

    background_tasks.add_task(
        _record_and_finalize,
        clip_id=clip.id,
        device_id=device_id,
        channel_no=payload.channel_no,
        duration_s=payload.duration_s,
    )

    return RecordingOut.model_validate(clip)
