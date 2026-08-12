from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.device import Device, Protocol
from app.models.telemetry_point import TelemetryPoint
from app.models.vehicle import LicenseStatus, Vehicle, VehicleType
from app.models.vehicle_latest import VehicleLatest


async def test_ingest_telemetry_updates_all_stores(client, clean_db: AsyncSession, fake_redis, auth_headers):
    # Seed vehicle and device.
    vehicle = Vehicle(
        registration_no="INT001",
        vehicle_code="VI001",
        vehicle_type=VehicleType.car,
        license_status=LicenseStatus.valid,
    )
    clean_db.add(vehicle)
    await clean_db.flush()

    device = Device(
        vehicle_id=vehicle.id,
        device_serial="INTSR001",
        sim_number="9000000001",
        protocol=Protocol.sim,
    )
    clean_db.add(device)
    await clean_db.flush()

    recorded_at = datetime.now(timezone.utc)
    payload = {
        "device_id": device.id,
        "recorded_at": recorded_at.isoformat(),
        "latitude": 17.385,
        "longitude": 78.486,
        "speed_kmh": 42.0,
        "heading_deg": 180.0,
        "ignition_on": True,
    }

    response = await client.post(
        "/api/dev/ingest/telemetry",
        json=payload,
        headers={"X-Device-Key": settings.DEV_DEVICE_KEY, **auth_headers},
    )
    assert response.status_code in {200, 204}

    # Postgres telemetry_points has the new row.
    result = await clean_db.execute(
        select(TelemetryPoint).where(TelemetryPoint.device_id == device.id)
    )
    point = result.scalar_one_or_none()
    assert point is not None
    assert point.latitude == 17.385
    assert point.longitude == 78.486
    assert point.speed_kmh == 42.0
    assert point.ignition_on is True

    # vehicle_latest status updated.
    latest = await clean_db.get(VehicleLatest, vehicle.id)
    assert latest is not None
    assert latest.latitude == 17.385
    assert latest.longitude == 78.486
    assert latest.status is not None

    # Redis fleet:latest hash updated.
    raw = await fake_redis.hgetall("fleet:latest")
    assert str(vehicle.id) in raw
    assert "17.385" in raw[str(vehicle.id)]
