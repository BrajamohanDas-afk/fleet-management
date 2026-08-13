import asyncio
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_redis
from app.core.database import AsyncSessionLocal, get_db
from app.models.device_channel import DeviceChannel
from app.models.video_clip import VideoClip
from app.repositories import device_repository
from app.schemas.device import DeviceChannelHealthOut, DeviceChannelOut
from app.schemas.recording import RecordingCreate, RecordingOut
from app.services.device_service import get_channel_health, get_device_channels
from app.services.recording_service import (
    finalize_recording,
    run_ffmpeg_recording,
    start_recording,
)
from app.services.stream_command_service import publish_stream_command

router = APIRouter(prefix="/devices", tags=["devices"])


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
        if not channel.rtsp_url:
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
        if channel and channel.stream_path and clip.file_path:
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

    clip = await start_recording(
        db,
        device_id=device_id,
        channel_no=payload.channel_no,
        duration_s=payload.duration_s,
    )

    background_tasks.add_task(
        _record_and_finalize,
        clip_id=clip.id,
        device_id=device_id,
        channel_no=payload.channel_no,
        duration_s=payload.duration_s,
    )

    return RecordingOut.model_validate(clip)
