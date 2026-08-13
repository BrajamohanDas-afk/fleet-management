from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.database import AsyncSessionLocal
from app.services.cleanup_service import cleanup_clips, cleanup_telemetry
from app.services.traccar_service import TraccarAuthError, TraccarError, mark_stale_traccar_devices, sync_traccar_once
from app.core.redis import get_redis_client
from app.core.config import settings

_scheduler: AsyncIOScheduler | None = None


async def _run_cleanup_telemetry() -> None:
    async with AsyncSessionLocal() as db:
        await cleanup_telemetry(db, retention_days=90)
        await db.commit()


async def _run_cleanup_clips() -> None:
    async with AsyncSessionLocal() as db:
        await cleanup_clips(db, retention_days=7)
        await db.commit()


async def _run_traccar_sync() -> None:
    async with AsyncSessionLocal() as db:
        try:
            await sync_traccar_once(db, get_redis_client())
        except (TraccarAuthError, TraccarError):
            # The device connection_status records preserve the reason for the UI.
            pass
        await mark_stale_traccar_devices(db)


def start_scheduler() -> AsyncIOScheduler:
    """Create and start the APScheduler with daily 03:00 cleanup jobs."""
    global _scheduler
    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(
        _run_cleanup_telemetry,
        trigger=CronTrigger(hour=3, minute=0),
        id="cleanup_telemetry",
        replace_existing=True,
    )
    _scheduler.add_job(
        _run_traccar_sync,
        trigger="interval",
        seconds=settings.TRACCAR_SYNC_INTERVAL_SECONDS,
        id="traccar_sync",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    _scheduler.add_job(
        _run_cleanup_clips,
        trigger=CronTrigger(hour=3, minute=0),
        id="cleanup_clips",
        replace_existing=True,
    )
    _scheduler.start()
    return _scheduler


def shutdown_scheduler() -> None:
    """Stop the running cleanup scheduler, if any."""
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
