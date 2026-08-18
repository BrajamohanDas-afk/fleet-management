import json

from fastapi import APIRouter, Depends, HTTPException
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_redis
from app.core.database import get_db
from app.models.vehicle_latest import VehicleLatest
from app.schemas.tracking import (
    TrackingActionOut,
    TrackingHeartbeatIn,
    TrackingLatestOut,
    TrackingLocationIn,
    TrackingLocationOut,
    TrackingPermissionDeniedIn,
    TrackingSessionSummaryOut,
)
from app.services.tracking_service import (
    ingest_browser_location,
    load_public_session,
    mark_heartbeat,
    mark_permission_denied,
)

router = APIRouter(prefix="/v1/tracking", tags=["tracking"])


@router.get("/session/{token}", response_model=TrackingSessionSummaryOut)
async def get_tracking_session(
    token: str,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> TrackingSessionSummaryOut:
    session = await load_public_session(db, token)
    vehicle = session.trip.vehicle if session.trip is not None else None
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    latest_out = None
    raw = await redis.hget("fleet:latest", str(vehicle.id))
    if raw:
        try:
            latest_data = json.loads(raw)
        except json.JSONDecodeError:
            latest_data = {}
        latest_out = TrackingLatestOut(
            latitude=latest_data.get("latitude"),
            longitude=latest_data.get("longitude"),
            speed_kmh=latest_data.get("speed_kmh"),
            heading_deg=latest_data.get("heading_deg"),
            status=latest_data.get("status"),
            recorded_at=latest_data.get("recorded_at"),
            received_at=latest_data.get("received_at"),
        )
    else:
        latest = await db.get(VehicleLatest, vehicle.id)
        if latest is not None:
            latest_out = TrackingLatestOut(
                latitude=latest.latitude,
                longitude=latest.longitude,
                speed_kmh=latest.speed_kmh,
                heading_deg=latest.heading_deg,
                status=latest.status.value,
                recorded_at=latest.recorded_at,
                received_at=latest.received_at,
            )

    return TrackingSessionSummaryOut(
        trip_id=session.trip_id,
        origin=session.trip.origin,
        destination=session.trip.destination,
        vehicle_id=vehicle.id,
        registration_no=vehicle.registration_no,
        vehicle_code=vehicle.vehicle_code,
        vehicle_type=vehicle.vehicle_type,
        status=session.status,
        expires_at=session.expires_at,
        last_seen_at=session.last_seen_at,
        installation_bound=session.installation_id is not None,
        latest=latest_out,
    )


@router.post("/location", response_model=TrackingLocationOut)
async def post_location(
    payload: TrackingLocationIn,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> TrackingLocationOut:
    point, duplicate, quality = await ingest_browser_location(db, redis, payload)
    await db.commit()
    return TrackingLocationOut(
        accepted=True,
        duplicate=duplicate,
        sequence=point.sequence if point is not None else payload.sequence,
        quality=quality,
    )


@router.post("/heartbeat", response_model=TrackingActionOut)
async def post_heartbeat(
    payload: TrackingHeartbeatIn,
    db: AsyncSession = Depends(get_db),
) -> TrackingActionOut:
    await mark_heartbeat(db, payload.session_token, payload.installation_id)
    await db.commit()
    return TrackingActionOut(status="ok")


@router.post("/permission-denied", response_model=TrackingActionOut)
async def post_permission_denied(
    payload: TrackingPermissionDeniedIn,
    db: AsyncSession = Depends(get_db),
) -> TrackingActionOut:
    await mark_permission_denied(
        db,
        payload.session_token,
        payload.installation_id,
        payload.reason,
    )
    await db.commit()
    return TrackingActionOut(status="ok")
