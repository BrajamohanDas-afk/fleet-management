import json
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device, Protocol
from app.models.telemetry_point import TelemetryPoint
from app.models.vehicle import LicenseStatus, Vehicle, VehicleType
from app.models.vehicle_latest import VehicleLatest
from app.services.status_service import VehicleStatus
from app.services.telemetry_service import ingest_telemetry


@pytest.fixture
async def vehicle_and_device(db: AsyncSession):
    vehicle = Vehicle(
        registration_no="TEST1234",
        vehicle_code="VTEST",
        vehicle_type=VehicleType.car,
        license_status=LicenseStatus.valid,
        license_expiry=None,
    )
    db.add(vehicle)
    await db.flush()

    device = Device(
        vehicle_id=vehicle.id,
        device_serial="DEVTEST",
        sim_number="9000000000",
        protocol=Protocol.sim,
        last_seen_at=None,
    )
    db.add(device)
    await db.flush()

    db.add(VehicleLatest(vehicle_id=vehicle.id, device_id=device.id))
    await db.flush()

    return vehicle, device


async def test_ingest_creates_telemetry_and_updates_latest(
    db: AsyncSession, vehicle_and_device
):
    vehicle, device = vehicle_and_device
    redis = AsyncMock()
    recorded_at = datetime.now(timezone.utc)

    point = await ingest_telemetry(
        db,
        redis,
        device.id,
        recorded_at,
        latitude=17.4,
        longitude=78.5,
        speed_kmh=45.0,
        heading_deg=90.0,
        ignition_on=True,
    )

    assert point is not None
    assert point.device_id == device.id
    assert point.latitude == 17.4
    assert point.speed_kmh == 45.0

    latest = await db.get(VehicleLatest, vehicle.id)
    assert latest is not None
    assert latest.device_id == device.id
    assert latest.latitude == 17.4
    assert latest.longitude == 78.5
    assert latest.speed_kmh == 45.0
    assert latest.status == VehicleStatus.moving

    refreshed_device = await db.get(Device, device.id)
    assert refreshed_device is not None
    assert refreshed_device.last_seen_at is not None


async def test_ingest_duplicate_recorded_at_is_ignored(
    db: AsyncSession, vehicle_and_device
):
    vehicle, device = vehicle_and_device
    redis = AsyncMock()
    recorded_at = datetime.now(timezone.utc)

    first = await ingest_telemetry(
        db,
        redis,
        device.id,
        recorded_at,
        latitude=17.4,
        longitude=78.5,
        speed_kmh=30.0,
        heading_deg=0.0,
        ignition_on=True,
    )
    assert first is not None

    second = await ingest_telemetry(
        db,
        redis,
        device.id,
        recorded_at,
        latitude=18.0,
        longitude=79.0,
        speed_kmh=50.0,
        heading_deg=180.0,
        ignition_on=False,
    )
    assert second is None


async def test_ingest_late_packet_is_ignored(
    db: AsyncSession, vehicle_and_device
):
    vehicle, device = vehicle_and_device
    redis = AsyncMock()
    now = datetime.now(timezone.utc)

    first = await ingest_telemetry(
        db,
        redis,
        device.id,
        now,
        latitude=17.4,
        longitude=78.5,
        speed_kmh=30.0,
        heading_deg=0.0,
        ignition_on=True,
    )
    assert first is not None

    late = now - timedelta(seconds=10)
    second = await ingest_telemetry(
        db,
        redis,
        device.id,
        late,
        latitude=18.0,
        longitude=79.0,
        speed_kmh=50.0,
        heading_deg=180.0,
        ignition_on=False,
    )
    assert second is None


async def test_ingest_publishes_to_redis(
    db: AsyncSession, vehicle_and_device
):
    vehicle, device = vehicle_and_device
    redis = AsyncMock()
    recorded_at = datetime.now(timezone.utc)

    await ingest_telemetry(
        db,
        redis,
        device.id,
        recorded_at,
        latitude=17.4,
        longitude=78.5,
        speed_kmh=10.0,
        heading_deg=45.0,
        ignition_on=True,
    )

    redis.publish.assert_called_once()
    call_args = redis.publish.call_args
    assert call_args.kwargs == {}
    channel, message = call_args.args
    assert channel == "fleet:telemetry"

    payload = json.loads(message)
    assert payload["device_id"] == device.id
    assert payload["vehicle_id"] == vehicle.id
    assert payload["latitude"] == 17.4
    assert payload["longitude"] == 78.5
    assert payload["speed_kmh"] == 10.0
    assert payload["heading_deg"] == 45.0
    assert payload["ignition_on"] is True
    assert payload["status"] == VehicleStatus.moving.value
    assert "recorded_at" in payload
    assert "received_at" in payload
