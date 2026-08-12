from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_redis
from app.core.config import settings
from app.core.database import get_db
from app.services.telemetry_service import ingest_telemetry

router = APIRouter(prefix="/dev", tags=["dev"])


@router.post("/ingest/telemetry")
async def ingest_telemetry_endpoint(
    payload: dict[str, Any],
    x_device_key: str = Header(..., alias="X-Device-Key"),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    current_user: dict = Depends(get_current_user),
) -> dict[str, str]:
    _ = current_user

    if settings.ENV != "dev":
        raise HTTPException(status_code=404, detail="Not found")

    if x_device_key != settings.DEV_DEVICE_KEY:
        raise HTTPException(status_code=403, detail="Invalid device key")

    device_id = payload.get("device_id")
    recorded_at_raw = payload.get("recorded_at")
    latitude = payload.get("latitude")
    longitude = payload.get("longitude")
    speed_kmh = payload.get("speed_kmh")
    heading_deg = payload.get("heading_deg")
    ignition_on = payload.get("ignition_on")

    if device_id is None or latitude is None or longitude is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="device_id, latitude, and longitude are required",
        )

    if isinstance(recorded_at_raw, str):
        recorded_at = datetime.fromisoformat(recorded_at_raw)
    elif isinstance(recorded_at_raw, datetime):
        recorded_at = recorded_at_raw
    else:
        recorded_at = datetime.utcnow()

    await ingest_telemetry(
        db,
        redis,
        int(device_id),
        recorded_at,
        float(latitude),
        float(longitude),
        float(speed_kmh) if speed_kmh is not None else None,
        float(heading_deg) if heading_deg is not None else None,
        bool(ignition_on) if ignition_on is not None else None,
    )
    await db.commit()
    return {"status": "ok"}
