import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device_channel import DeviceChannel
from app.models.video_clip import VideoClip
from app.services.device_service import build_rtsp_url

CLIPS_DIR = Path("/clips")


def _ensure_clips_dir() -> None:
    CLIPS_DIR.mkdir(parents=True, exist_ok=True)


def _build_clip_file_path(device_id: int, channel_no: int, timestamp: datetime) -> Path:
    ts = timestamp.strftime("%Y%m%d%H%M%S")
    return CLIPS_DIR / f"{device_id}_{channel_no}_{ts}.mp4"


async def start_recording(
    db: AsyncSession,
    device_id: int,
    channel_no: int,
    duration_s: int,
) -> VideoClip:
    if duration_s < 1:
        duration_s = 60
    if duration_s > 300:
        duration_s = 300

    result = await db.execute(
        select(DeviceChannel).where(
            (DeviceChannel.device_id == device_id)
            & (DeviceChannel.channel_no == channel_no)
        )
    )
    channel = result.scalar_one_or_none()

    if channel is None:
        raise ValueError(f"Channel {channel_no} not found for device {device_id}")
    if not channel.stream_path:
        raise ValueError(f"Channel {channel_no} has no stream path")

    started_at = datetime.now(timezone.utc)
    file_path = _build_clip_file_path(device_id, channel_no, started_at)
    _ensure_clips_dir()

    clip = VideoClip(
        device_id=device_id,
        channel_no=channel_no,
        started_at=started_at,
        file_path=str(file_path),
        size_bytes=None,
    )
    db.add(clip)
    await db.flush()
    await db.refresh(clip)
    return clip


def run_ffmpeg_recording(
    file_path: Path,
    stream_path: str,
    duration_s: int,
) -> None:
    rtsp_url = build_rtsp_url(stream_path)
    if rtsp_url is None:
        return

    _ensure_clips_dir()
    cmd = [
        "ffmpeg",
        "-y",
        "-rtsp_transport",
        "tcp",
        "-i",
        rtsp_url,
        "-t",
        str(duration_s),
        "-c",
        "copy",
        "-f",
        "mp4",
        str(file_path),
    ]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except (subprocess.CalledProcessError, FileNotFoundError):
        # If ffmpeg fails, leave the partial file in place; the caller updates ended_at.
        pass


async def finalize_recording(
    db: AsyncSession,
    clip_id: int,
) -> VideoClip | None:
    clip = await db.get(VideoClip, clip_id)
    if clip is None:
        return None
    clip.ended_at = datetime.now(timezone.utc)
    try:
        size = os.path.getsize(clip.file_path)
        clip.size_bytes = size
    except OSError:
        clip.size_bytes = None
    await db.flush()
    await db.refresh(clip)
    return clip
