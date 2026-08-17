import hashlib
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.tracking import (
    AuditLog,
    AuditEventType,
    LocationPoint,
    LocationQuality,
    TrackingSession,
    TrackingSessionStatus,
)
from app.models.vehicle import LicenseStatus, Vehicle, VehicleType


async def _create_vehicle(db: AsyncSession) -> Vehicle:
    vehicle = Vehicle(
        registration_no="TRIP001",
        vehicle_code="TRIP-001",
        vehicle_type=VehicleType.car,
        license_status=LicenseStatus.valid,
    )
    db.add(vehicle)
    await db.flush()
    return vehicle


async def test_create_trip_and_tracking_session_returns_one_time_token_url(
    client,
    auth_headers,
    clean_db: AsyncSession,
):
    vehicle = await _create_vehicle(clean_db)
    await clean_db.commit()

    trip_response = await client.post(
        "/api/v1/trips",
        json={
            "vehicle_id": vehicle.id,
            "origin": "Chandigarh",
            "destination": "Delhi",
        },
        headers=auth_headers,
    )

    assert trip_response.status_code == 201
    trip = trip_response.json()
    assert trip["status"] == "CREATED"
    assert trip["vehicle_id"] == vehicle.id

    session_response = await client.post(
        f"/api/v1/trips/{trip['id']}/tracking-session",
        json={"duration_minutes": 30},
        headers=auth_headers,
    )

    assert session_response.status_code == 201
    session = session_response.json()
    assert session["status"] == "WAITING_FOR_DRIVER"
    assert session["url"].startswith(
        f"{settings.TRACKING_PUBLIC_BASE_URL.rstrip('/')}/t/"
    )

    token = urlparse(session["url"]).path.rsplit("/", 1)[-1]
    stored_session = await clean_db.get(TrackingSession, session["id"])
    assert stored_session is not None
    assert stored_session.token_hash == hashlib.sha256(token.encode()).hexdigest()
    assert stored_session.token_hash != token
    assert token not in stored_session.token_hash

    audit = await clean_db.scalar(
        select(AuditLog).where(
            AuditLog.event_type == AuditEventType.TRACKING_SESSION_CREATED.value
        )
    )
    assert audit is not None
    assert audit.tracking_session_id == stored_session.id


async def test_trip_start_complete_and_session_revoke_extend_are_audited(
    client,
    auth_headers,
    clean_db: AsyncSession,
):
    vehicle = await _create_vehicle(clean_db)
    await clean_db.commit()

    trip = (
        await client.post(
            "/api/v1/trips",
            json={"vehicle_id": vehicle.id},
            headers=auth_headers,
        )
    ).json()
    session = (
        await client.post(
            f"/api/v1/trips/{trip['id']}/tracking-session",
            json={"duration_minutes": 10},
            headers=auth_headers,
        )
    ).json()

    start_response = await client.post(
        f"/api/v1/trips/{trip['id']}/start",
        headers=auth_headers,
    )
    assert start_response.status_code == 200
    assert start_response.json()["status"] == "ACTIVE"

    extend_response = await client.post(
        f"/api/v1/tracking/{session['id']}/extend",
        json={"duration_minutes": 15},
        headers=auth_headers,
    )
    assert extend_response.status_code == 200
    assert extend_response.json()["status"] == "WAITING_FOR_DRIVER"

    revoke_response = await client.post(
        f"/api/v1/tracking/{session['id']}/revoke",
        headers=auth_headers,
    )
    assert revoke_response.status_code == 200
    assert revoke_response.json()["status"] == "REVOKED"
    assert revoke_response.json()["revoked_at"] is not None

    complete_response = await client.post(
        f"/api/v1/trips/{trip['id']}/complete",
        headers=auth_headers,
    )
    assert complete_response.status_code == 200
    assert complete_response.json()["status"] == "COMPLETED"

    events = (
        await clean_db.execute(
            select(AuditLog.event_type).order_by(AuditLog.id)
        )
    ).scalars().all()
    assert AuditEventType.TRIP_STARTED.value in events
    assert AuditEventType.TRACKING_SESSION_EXTENDED.value in events
    assert AuditEventType.TRACKING_SESSION_REVOKED.value in events
    assert AuditEventType.TRIP_COMPLETED.value in events


async def test_tracking_status_marks_expired_session(
    client,
    auth_headers,
    clean_db: AsyncSession,
):
    vehicle = await _create_vehicle(clean_db)
    await clean_db.commit()
    trip = (
        await client.post(
            "/api/v1/trips",
            json={"vehicle_id": vehicle.id},
            headers=auth_headers,
        )
    ).json()
    session = (
        await client.post(
            f"/api/v1/trips/{trip['id']}/tracking-session",
            json={"duration_minutes": 1},
            headers=auth_headers,
        )
    ).json()
    stored_session = await clean_db.get(TrackingSession, session["id"])
    stored_session.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await clean_db.commit()

    status_response = await client.get(
        f"/api/v1/tracking/{session['id']}/status",
        headers=auth_headers,
    )

    assert status_response.status_code == 200
    assert status_response.json()["status"] == "EXPIRED"


async def test_trip_route_returns_points_ordered_by_capture_time(
    client,
    auth_headers,
    clean_db: AsyncSession,
):
    vehicle = await _create_vehicle(clean_db)
    await clean_db.commit()
    trip = (
        await client.post(
            "/api/v1/trips",
            json={"vehicle_id": vehicle.id},
            headers=auth_headers,
        )
    ).json()
    session = (
        await client.post(
            f"/api/v1/trips/{trip['id']}/tracking-session",
            json={"duration_minutes": 10},
            headers=auth_headers,
        )
    ).json()
    base_time = datetime.now(timezone.utc)
    clean_db.add_all(
        [
            LocationPoint(
                session_id=session["id"],
                sequence=2,
                latitude=30.8,
                longitude=76.8,
                captured_at=base_time + timedelta(minutes=2),
                quality=LocationQuality.GOOD,
            ),
            LocationPoint(
                session_id=session["id"],
                sequence=1,
                latitude=30.7,
                longitude=76.7,
                captured_at=base_time + timedelta(minutes=1),
                quality=LocationQuality.USABLE,
            ),
        ]
    )
    await clean_db.commit()

    route_response = await client.get(
        f"/api/v1/trips/{trip['id']}/route",
        headers=auth_headers,
    )

    assert route_response.status_code == 200
    data = route_response.json()
    assert [point["sequence"] for point in data] == [1, 2]
    assert data[0]["latitude"] == 30.7
