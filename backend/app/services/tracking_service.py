import hashlib
import json
import math
from datetime import datetime, timezone

from fastapi import HTTPException, status
from redis.asyncio import Redis
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.tracking import (
    AuditEventType,
    AuditLog,
    LocationPoint,
    LocationQuality,
    TrackingSession,
    TrackingSessionStatus,
    Trip,
)
from app.models.vehicle import Vehicle
from app.models.vehicle_latest import VehicleLatest
from app.schemas.tracking import TrackingLocationIn
from app.services.status_service import derive_status

SUSPICIOUS_SPEED_MPS = 70.0


def hash_tracking_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


async def load_public_session(db: AsyncSession, token: str) -> TrackingSession:
    session = await db.scalar(
        select(TrackingSession)
        .options(selectinload(TrackingSession.trip).selectinload(Trip.vehicle))
        .options(selectinload(TrackingSession.vehicle))
        .where(TrackingSession.token_hash == hash_tracking_token(token))
    )
    now = _utc_now()
    if (
        session is None
        or session.revoked_at is not None
        or _as_utc(session.expires_at) <= now
        or session.status
        in {
            TrackingSessionStatus.COMPLETED,
            TrackingSessionStatus.EXPIRED,
            TrackingSessionStatus.REVOKED,
        }
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tracking session is invalid or expired",
        )
    return session


def bind_installation(session: TrackingSession, installation_id: str) -> None:
    if session.installation_id is None:
        session.installation_id = installation_id
        return
    if session.installation_id != installation_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "installation_conflict",
                "message": "Tracking session is already active on another installation",
            },
        )


def _haversine_meters(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    radius_m = 6_371_000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    return radius_m * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _calculated_speed_mps(
    previous: LocationPoint | None,
    payload: TrackingLocationIn,
) -> float | None:
    if previous is None:
        return None
    elapsed = (
        _as_utc(payload.captured_at) - _as_utc(previous.captured_at)
    ).total_seconds()
    if elapsed <= 0:
        return None
    distance = _haversine_meters(
        previous.latitude,
        previous.longitude,
        payload.latitude,
        payload.longitude,
    )
    return distance / elapsed


def classify_location_quality(
    accuracy: float | None,
    speed_device: float | None,
    speed_calculated: float | None,
) -> LocationQuality:
    if (
        speed_calculated is not None
        and speed_calculated > SUSPICIOUS_SPEED_MPS
        or speed_device is not None
        and speed_device > SUSPICIOUS_SPEED_MPS
    ):
        return LocationQuality.SUSPICIOUS

    if accuracy is None:
        return LocationQuality.QUESTIONABLE
    if accuracy <= 20:
        return LocationQuality.GOOD
    if accuracy <= 50:
        return LocationQuality.USABLE
    if accuracy <= 100:
        return LocationQuality.QUESTIONABLE
    return LocationQuality.LOW_QUALITY


async def _publish_browser_latest(
    db: AsyncSession,
    redis: Redis,
    session: TrackingSession,
    point: LocationPoint,
    vehicle: Vehicle,
    received_at: datetime,
) -> None:
    speed_kmh = None
    if point.speed_device is not None:
        speed_kmh = point.speed_device * 3.6
    elif point.speed_calculated is not None:
        speed_kmh = point.speed_calculated * 3.6

    fix_age_seconds = (_as_utc(received_at) - _as_utc(point.captured_at)).total_seconds()
    vehicle_status = derive_status(fix_age_seconds, speed_kmh)

    latest = await db.get(VehicleLatest, vehicle.id)
    should_update_latest = latest is None or latest.recorded_at is None
    if latest is not None and latest.recorded_at is not None:
        should_update_latest = _as_utc(point.captured_at) >= _as_utc(latest.recorded_at)

    if should_update_latest:
        if latest is None:
            latest = VehicleLatest(vehicle_id=vehicle.id)
            db.add(latest)
        latest.device_id = None
        latest.latitude = point.latitude
        latest.longitude = point.longitude
        latest.speed_kmh = speed_kmh
        latest.heading_deg = point.heading
        latest.ignition_on = None
        latest.recorded_at = point.captured_at
        latest.received_at = received_at
        latest.status = vehicle_status
        await db.flush()

    payload = {
        "device_id": None,
        "vehicle_id": vehicle.id,
        "trip_id": session.trip_id,
        "tracking_session_id": session.id,
        "installation_id": session.installation_id,
        "sequence": point.sequence,
        "latitude": point.latitude,
        "longitude": point.longitude,
        "speed_kmh": speed_kmh,
        "heading_deg": point.heading,
        "ignition_on": None,
        "status": vehicle_status.value,
        "quality": point.quality.value,
        "recorded_at": point.captured_at.isoformat(),
        "received_at": received_at.isoformat(),
        "source": "browser",
    }
    await redis.publish("fleet:telemetry", json.dumps(payload))
    await redis.hset(
        "fleet:latest",
        mapping={
            str(vehicle.id): json.dumps(
                {
                    "vehicle_id": vehicle.id,
                    "registration_no": vehicle.registration_no,
                    "vehicle_code": vehicle.vehicle_code,
                    "vehicle_type": vehicle.vehicle_type.value,
                    "latitude": point.latitude,
                    "longitude": point.longitude,
                    "speed_kmh": speed_kmh,
                    "heading_deg": point.heading,
                    "ignition_on": None,
                    "status": vehicle_status.value,
                    "recorded_at": point.captured_at.isoformat(),
                    "received_at": received_at.isoformat(),
                    "source": "browser",
                    "connection_status": "connected",
                    "quality": point.quality.value,
                    "trip_id": session.trip_id,
                    "tracking_session_id": session.id,
                }
            )
        },
    )


async def ingest_browser_location(
    db: AsyncSession,
    redis: Redis,
    payload: TrackingLocationIn,
) -> tuple[LocationPoint | None, bool, LocationQuality | None]:
    session = await load_public_session(db, payload.session_token)
    bind_installation(session, payload.installation_id)

    duplicate = await db.scalar(
        select(LocationPoint).where(
            LocationPoint.session_id == session.id,
            LocationPoint.sequence == payload.sequence,
        )
    )
    if duplicate is not None:
        return duplicate, True, duplicate.quality

    vehicle = session.trip.vehicle if session.trip is not None else session.vehicle
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    previous = await db.scalar(
        select(LocationPoint)
        .where(
            LocationPoint.session_id == session.id,
            LocationPoint.sequence < payload.sequence,
        )
        .order_by(desc(LocationPoint.sequence))
        .limit(1)
    )
    speed_calculated = _calculated_speed_mps(previous, payload)
    quality = classify_location_quality(
        payload.accuracy,
        payload.speed,
        speed_calculated,
    )
    received_at = _utc_now()
    point = LocationPoint(
        session_id=session.id,
        sequence=payload.sequence,
        latitude=payload.latitude,
        longitude=payload.longitude,
        accuracy=payload.accuracy,
        speed_device=payload.speed,
        speed_calculated=speed_calculated,
        heading=payload.heading,
        altitude=payload.altitude,
        captured_at=payload.captured_at,
        received_at=received_at,
        quality=quality,
    )
    db.add(point)
    session.last_seen_at = received_at
    session.status = TrackingSessionStatus.ACTIVE
    await db.flush()
    await _publish_browser_latest(db, redis, session, point, vehicle, received_at)
    return point, False, quality


async def mark_heartbeat(
    db: AsyncSession,
    token: str,
    installation_id: str,
) -> TrackingSession:
    session = await load_public_session(db, token)
    bind_installation(session, installation_id)
    session.last_seen_at = _utc_now()
    session.status = TrackingSessionStatus.ACTIVE
    await db.flush()
    return session


async def mark_permission_denied(
    db: AsyncSession,
    token: str,
    installation_id: str,
    reason: str | None = None,
) -> TrackingSession:
    session = await load_public_session(db, token)
    bind_installation(session, installation_id)
    session.last_seen_at = _utc_now()
    session.status = TrackingSessionStatus.PERMISSION_DENIED
    db.add(
        AuditLog(
            trip_id=session.trip_id,
            tracking_session_id=session.id,
            event_type=AuditEventType.PERMISSION_DENIED.value,
            metadata_json={"reason": reason} if reason else None,
        )
    )
    await db.flush()
    return session
