import json
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tracking import (
    LocationPoint,
    LocationQuality,
    TrackingSession,
    TrackingSessionStatus,
    Trip,
    TripStatus,
)
from app.models.vehicle import LicenseStatus, Vehicle, VehicleType
from app.models.vehicle_latest import VehicleLatest
from app.services.tracking_service import hash_tracking_token


TOKEN = "tracking-token-for-tests"
INSTALLATION_ID = "install-1"


@pytest.fixture
async def tracking_session(clean_db: AsyncSession):
    vehicle = Vehicle(
        registration_no="TRK1234",
        vehicle_code="TRK001",
        vehicle_type=VehicleType.car,
        license_status=LicenseStatus.valid,
    )
    clean_db.add(vehicle)
    await clean_db.flush()

    trip = Trip(
        vehicle_id=vehicle.id,
        status=TripStatus.ACTIVE,
    )
    clean_db.add(trip)
    await clean_db.flush()

    session = TrackingSession(
        trip_id=trip.id,
        vehicle_id=vehicle.id,
        token_hash=hash_tracking_token(TOKEN),
        status=TrackingSessionStatus.WAITING_FOR_DRIVER,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    clean_db.add(session)
    await clean_db.flush()
    return vehicle, session


def _location_payload(sequence: int = 1, **overrides):
    payload = {
        "session_token": TOKEN,
        "installation_id": INSTALLATION_ID,
        "sequence": sequence,
        "latitude": 17.385,
        "longitude": 78.486,
        "accuracy": 8.0,
        "speed": 10.0,
        "heading": 120.0,
        "altitude": 540.0,
        "captured_at": datetime.now(timezone.utc).isoformat(),
    }
    payload.update(overrides)
    return payload


async def test_valid_location_upload_updates_session_point_latest_and_redis(
    client,
    tracking_session,
    clean_db: AsyncSession,
    fake_redis,
):
    vehicle, session = tracking_session

    response = await client.post("/api/v1/tracking/location", json=_location_payload())

    assert response.status_code == 200
    assert response.json() == {
        "accepted": True,
        "duplicate": False,
        "sequence": 1,
        "quality": LocationQuality.GOOD.value,
    }

    await clean_db.refresh(session)
    assert session.installation_id == INSTALLATION_ID
    assert session.status == TrackingSessionStatus.ACTIVE
    assert session.last_seen_at is not None

    point = await clean_db.scalar(select(LocationPoint))
    assert point is not None
    assert point.session_id == session.id
    assert point.sequence == 1
    assert point.latitude == 17.385
    assert point.speed_device == 10.0

    latest = await clean_db.get(VehicleLatest, vehicle.id)
    assert latest is not None
    assert latest.device_id is None
    assert latest.latitude == 17.385
    assert latest.speed_kmh == 36.0

    raw_latest = await fake_redis.hget("fleet:latest", str(vehicle.id))
    assert raw_latest is not None
    redis_latest = json.loads(raw_latest)
    assert redis_latest["source"] == "browser"
    assert redis_latest["latitude"] == 17.385


async def test_duplicate_sequence_is_idempotent(
    client,
    tracking_session,
    clean_db: AsyncSession,
    fake_redis,
):
    vehicle, _session = tracking_session
    first = await client.post("/api/v1/tracking/location", json=_location_payload())
    assert first.status_code == 200
    assert len(fake_redis.published) == 1

    duplicate = await client.post(
        "/api/v1/tracking/location",
        json=_location_payload(latitude=18.0, longitude=79.0),
    )

    assert duplicate.status_code == 200
    assert duplicate.json()["duplicate"] is True
    count = await clean_db.scalar(select(func.count()).select_from(LocationPoint))
    assert count == 1
    latest = await clean_db.get(VehicleLatest, vehicle.id)
    assert latest is not None
    assert latest.latitude == 17.385
    assert len(fake_redis.published) == 1


async def test_invalid_token_is_rejected(client, tracking_session):
    response = await client.post(
        "/api/v1/tracking/location",
        json=_location_payload(session_token="not-a-valid-test-token"),
    )

    assert response.status_code == 404


@pytest.mark.parametrize(
    ("status_value", "revoked_at", "expires_delta"),
    [
        (TrackingSessionStatus.WAITING_FOR_DRIVER, datetime.now(timezone.utc), timedelta(hours=1)),
        (TrackingSessionStatus.WAITING_FOR_DRIVER, None, -timedelta(seconds=1)),
        (TrackingSessionStatus.COMPLETED, None, timedelta(hours=1)),
    ],
)
async def test_revoked_expired_and_completed_sessions_are_rejected(
    client,
    tracking_session,
    clean_db: AsyncSession,
    status_value,
    revoked_at,
    expires_delta,
):
    _vehicle, session = tracking_session
    session.status = status_value
    session.revoked_at = revoked_at
    session.expires_at = datetime.now(timezone.utc) + expires_delta
    await clean_db.flush()

    response = await client.post("/api/v1/tracking/location", json=_location_payload())

    assert response.status_code == 404


async def test_permission_denied_marks_session(
    client,
    tracking_session,
    clean_db: AsyncSession,
):
    _vehicle, session = tracking_session

    response = await client.post(
        "/api/v1/tracking/permission-denied",
        json={
            "session_token": TOKEN,
            "installation_id": INSTALLATION_ID,
            "reason": "browser denied geolocation",
        },
    )

    assert response.status_code == 200
    await clean_db.refresh(session)
    assert session.installation_id == INSTALLATION_ID
    assert session.status == TrackingSessionStatus.PERMISSION_DENIED
    assert session.last_seen_at is not None


async def test_invalid_coordinates_are_rejected(client, tracking_session):
    response = await client.post(
        "/api/v1/tracking/location",
        json=_location_payload(latitude=91.0),
    )

    assert response.status_code == 422


async def test_location_upload_publishes_fleet_telemetry(
    client,
    tracking_session,
    fake_redis,
):
    vehicle, session = tracking_session

    response = await client.post("/api/v1/tracking/location", json=_location_payload())

    assert response.status_code == 200
    assert len(fake_redis.published) == 1
    channel, message = fake_redis.published[0]
    assert channel == "fleet:telemetry"
    payload = json.loads(message)
    assert payload["vehicle_id"] == vehicle.id
    assert payload["tracking_session_id"] == session.id
    assert payload["source"] == "browser"
    assert payload["quality"] == LocationQuality.GOOD.value
