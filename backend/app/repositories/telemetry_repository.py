from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.telemetry_point import TelemetryPoint


async def get_latest_for_device(
    db: AsyncSession, device_id: int
) -> TelemetryPoint | None:
    result = await db.execute(
        select(TelemetryPoint)
        .where(TelemetryPoint.device_id == device_id)
        .order_by(desc(TelemetryPoint.recorded_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_history_for_device(
    db: AsyncSession, device_id: int, limit: int = 100
) -> list[TelemetryPoint]:
    result = await db.execute(
        select(TelemetryPoint)
        .where(TelemetryPoint.device_id == device_id)
        .order_by(desc(TelemetryPoint.recorded_at))
        .limit(limit)
    )
    return list(result.scalars().all())
