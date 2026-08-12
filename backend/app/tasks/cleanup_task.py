from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.database import AsyncSessionLocal
from app.services.cleanup_service import cleanup_clips, cleanup_telemetry

_scheduler: AsyncIOScheduler | None = None


async def _run_cleanup_telemetry() -> None:
    async with AsyncSessionLocal() as db:
        await cleanup_telemetry(db, retention_days=90)
        await db.commit()


async def _run_cleanup_clips() -> None:
    async with AsyncSessionLocal() as db:
        await cleanup_clips(db, retention_days=7)
        await db.commit()


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
