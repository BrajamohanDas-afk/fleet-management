import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.telemetry_point import TelemetryPoint
from app.models.video_clip import VideoClip


async def cleanup_telemetry(db: AsyncSession, retention_days: int = 90) -> int:
    """Delete telemetry points older than the retention window."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    result = await db.execute(
        delete(TelemetryPoint).where(TelemetryPoint.recorded_at < cutoff)
    )
    await db.flush()
    return result.rowcount or 0


async def cleanup_clips(db: AsyncSession, retention_days: int = 7) -> int:
    """Delete video clip records and their underlying files older than retention."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    result = await db.execute(
        delete(VideoClip).where(VideoClip.started_at < cutoff).returning(VideoClip.file_path)
    )
    file_paths = result.scalars().all()

    for path in file_paths:
        if path and os.path.exists(path):
            os.remove(path)

    await db.flush()
    return len(file_paths)
