import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.tracking import (
    AuditEventType,
    AuditLog,
    Driver,
    LocationPoint,
    TrackingSession,
    TrackingSessionStatus,
    Trip,
    TripStatus,
)
from app.models.vehicle import Vehicle
from app.schemas.tracking import (
    LocationPointOut,
    TrackingSessionCreate,
    TrackingSessionExtend,
    TrackingSessionOut,
    TrackingSessionStatusOut,
    TripCreate,
    TripOut,
)

router = APIRouter(prefix="/v1", tags=["tracking-admin"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _tracking_url(token: str) -> str:
    return f"{settings.TRACKING_PUBLIC_BASE_URL.rstrip('/')}/t/{token}"


def _session_status_out(session: TrackingSession) -> TrackingSessionStatusOut:
    return TrackingSessionStatusOut(
        id=session.id,
        trip_id=session.trip_id,
        status=session.status,
        expires_at=session.expires_at,
        revoked_at=session.revoked_at,
        last_seen_at=session.last_seen_at,
    )


def _audit(
    *,
    event_type: AuditEventType,
    current_user: dict,
    trip_id: int | None = None,
    tracking_session_id: int | None = None,
    metadata: dict | None = None,
) -> AuditLog:
    return AuditLog(
        actor_username=current_user.get("username"),
        trip_id=trip_id,
        tracking_session_id=tracking_session_id,
        event_type=event_type.value,
        metadata_json=metadata,
    )


async def _get_trip(db: AsyncSession, trip_id: int) -> Trip:
    trip = await db.get(Trip, trip_id)
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


async def _get_session(db: AsyncSession, session_id: int) -> TrackingSession:
    session = await db.get(TrackingSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Tracking session not found")
    return session


async def _mark_expired_if_needed(db: AsyncSession, session: TrackingSession) -> None:
    terminal_statuses = {
        TrackingSessionStatus.COMPLETED,
        TrackingSessionStatus.EXPIRED,
        TrackingSessionStatus.REVOKED,
    }
    if session.status not in terminal_statuses and session.expires_at <= _utcnow():
        session.status = TrackingSessionStatus.EXPIRED
        await db.flush()


async def _generate_unique_token(db: AsyncSession) -> tuple[str, str]:
    for _ in range(5):
        token = secrets.token_urlsafe(32)
        token_hash = _hash_token(token)
        existing = await db.scalar(
            select(TrackingSession.id).where(TrackingSession.token_hash == token_hash)
        )
        if existing is None:
            return token, token_hash
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Could not generate unique tracking token",
    )


@router.post("/trips", response_model=TripOut, status_code=status.HTTP_201_CREATED)
async def create_trip(
    payload: TripCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> Trip:
    _ = current_user
    vehicle = await db.get(Vehicle, payload.vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    if payload.driver_id is not None and payload.driver_name:
        raise HTTPException(
            status_code=400,
            detail="Use either driver_id or driver_name, not both",
        )

    driver_id = payload.driver_id
    if driver_id is not None and await db.get(Driver, driver_id) is None:
        raise HTTPException(status_code=404, detail="Driver not found")
    if driver_id is None and payload.driver_name:
        driver = Driver(name=payload.driver_name, phone=payload.driver_phone)
        db.add(driver)
        await db.flush()
        driver_id = driver.id

    trip = Trip(
        vehicle_id=payload.vehicle_id,
        driver_id=driver_id,
        status=TripStatus.CREATED,
        origin=payload.origin,
        destination=payload.destination,
    )
    db.add(trip)
    await db.commit()
    await db.refresh(trip)
    return trip


@router.get("/trips/{trip_id}", response_model=TripOut)
async def get_trip(
    trip_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> Trip:
    _ = current_user
    return await _get_trip(db, trip_id)


@router.post("/trips/{trip_id}/start", response_model=TripOut)
async def start_trip(
    trip_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> Trip:
    trip = await _get_trip(db, trip_id)
    if trip.status in {TripStatus.COMPLETED, TripStatus.CANCELLED}:
        raise HTTPException(status_code=409, detail="Trip cannot be started")
    if trip.status != TripStatus.ACTIVE:
        trip.status = TripStatus.ACTIVE
        trip.start_time = trip.start_time or _utcnow()
        db.add(
            _audit(
                event_type=AuditEventType.TRIP_STARTED,
                current_user=current_user,
                trip_id=trip.id,
            )
        )
    await db.commit()
    await db.refresh(trip)
    return trip


@router.post("/trips/{trip_id}/complete", response_model=TripOut)
async def complete_trip(
    trip_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> Trip:
    trip = await _get_trip(db, trip_id)
    if trip.status == TripStatus.CANCELLED:
        raise HTTPException(status_code=409, detail="Cancelled trip cannot be completed")
    if trip.status != TripStatus.COMPLETED:
        trip.status = TripStatus.COMPLETED
        trip.end_time = trip.end_time or _utcnow()
        sessions = (
            await db.execute(
                select(TrackingSession).where(TrackingSession.trip_id == trip.id)
            )
        ).scalars().all()
        for session in sessions:
            if session.status != TrackingSessionStatus.REVOKED:
                session.status = TrackingSessionStatus.COMPLETED
        db.add(
            _audit(
                event_type=AuditEventType.TRIP_COMPLETED,
                current_user=current_user,
                trip_id=trip.id,
            )
        )
    await db.commit()
    await db.refresh(trip)
    return trip


@router.get("/trips/{trip_id}/route", response_model=list[LocationPointOut])
async def get_trip_route(
    trip_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> list[LocationPoint]:
    _ = current_user
    await _get_trip(db, trip_id)
    result = await db.execute(
        select(LocationPoint)
        .join(TrackingSession, LocationPoint.session_id == TrackingSession.id)
        .where(TrackingSession.trip_id == trip_id)
        .order_by(LocationPoint.captured_at, LocationPoint.sequence)
    )
    return list(result.scalars().all())


@router.post(
    "/trips/{trip_id}/tracking-session",
    response_model=TrackingSessionOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_tracking_session(
    trip_id: int,
    payload: TrackingSessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> TrackingSessionOut:
    trip = await _get_trip(db, trip_id)
    if trip.status in {TripStatus.COMPLETED, TripStatus.CANCELLED}:
        raise HTTPException(
            status_code=409,
            detail="Tracking session cannot be created for this trip",
        )

    token, token_hash = await _generate_unique_token(db)
    duration_minutes = payload.duration_minutes or settings.TRACKING_DEFAULT_DURATION_MINUTES
    session = TrackingSession(
        trip_id=trip.id,
        token_hash=token_hash,
        status=TrackingSessionStatus.WAITING_FOR_DRIVER,
        expires_at=_utcnow() + timedelta(minutes=duration_minutes),
    )
    db.add(session)
    await db.flush()
    db.add(
        _audit(
            event_type=AuditEventType.TRACKING_SESSION_CREATED,
            current_user=current_user,
            trip_id=trip.id,
            tracking_session_id=session.id,
            metadata={"duration_minutes": duration_minutes},
        )
    )
    await db.commit()
    await db.refresh(session)
    return TrackingSessionOut(
        id=session.id,
        trip_id=session.trip_id,
        status=session.status,
        url=_tracking_url(token),
        expires_at=session.expires_at,
        revoked_at=session.revoked_at,
        last_seen_at=session.last_seen_at,
    )


@router.get("/tracking/{session_id}/status", response_model=TrackingSessionStatusOut)
async def get_tracking_session_status(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> TrackingSessionStatusOut:
    _ = current_user
    session = await _get_session(db, session_id)
    await _mark_expired_if_needed(db, session)
    await db.commit()
    return _session_status_out(session)


@router.post("/tracking/{session_id}/revoke", response_model=TrackingSessionStatusOut)
async def revoke_tracking_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> TrackingSessionStatusOut:
    session = await _get_session(db, session_id)
    if session.status != TrackingSessionStatus.REVOKED:
        now = _utcnow()
        session.status = TrackingSessionStatus.REVOKED
        session.revoked_at = session.revoked_at or now
        db.add(
            _audit(
                event_type=AuditEventType.TRACKING_SESSION_REVOKED,
                current_user=current_user,
                trip_id=session.trip_id,
                tracking_session_id=session.id,
            )
        )
    await db.commit()
    return _session_status_out(session)


@router.post("/tracking/{session_id}/extend", response_model=TrackingSessionStatusOut)
async def extend_tracking_session(
    session_id: int,
    payload: TrackingSessionExtend,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> TrackingSessionStatusOut:
    session = await _get_session(db, session_id)
    if session.status in {
        TrackingSessionStatus.COMPLETED,
        TrackingSessionStatus.REVOKED,
    }:
        raise HTTPException(status_code=409, detail="Tracking session cannot be extended")

    base_time = max(session.expires_at, _utcnow())
    session.expires_at = base_time + timedelta(minutes=payload.duration_minutes)
    if session.status == TrackingSessionStatus.EXPIRED:
        session.status = TrackingSessionStatus.WAITING_FOR_DRIVER
    db.add(
        _audit(
            event_type=AuditEventType.TRACKING_SESSION_EXTENDED,
            current_user=current_user,
            trip_id=session.trip_id,
            tracking_session_id=session.id,
            metadata={"duration_minutes": payload.duration_minutes},
        )
    )
    await db.commit()
    return _session_status_out(session)
