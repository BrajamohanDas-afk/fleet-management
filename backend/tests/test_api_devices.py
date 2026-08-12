import json
from datetime import datetime, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device, Protocol
from app.models.device_channel import DeviceChannel
from app.models.vehicle import LicenseStatus, Vehicle, VehicleType


@pytest.fixture
async def device_with_channels(clean_db, db: AsyncSession):
    vehicle = Vehicle(
        registration_no="DEV001",
        vehicle_code="VD001",
        vehicle_type=VehicleType.car,
        license_status=LicenseStatus.valid,
    )
    db.add(vehicle)
    await db.flush()

    device = Device(
        vehicle_id=vehicle.id,
        device_serial="DEVSR001",
        sim_number="9000000099",
        protocol=Protocol.sim,
    )
    db.add(device)
    await db.flush()

    db.add(
        DeviceChannel(
            device_id=device.id,
            channel_no=1,
            label="Front",
            stream_path=f"device-{device.id}-ch1",
        )
    )
    db.add(
        DeviceChannel(
            device_id=device.id,
            channel_no=2,
            label="Rear",
            stream_path=f"device-{device.id}-ch2",
        )
    )
    await db.flush()

    return device


async def test_channels_endpoint(client, auth_headers, device_with_channels):
    device = device_with_channels
    response = await client.get(
        f"/api/devices/{device.id}/channels", headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2

    channel_nos = {ch["channel_no"] for ch in data}
    assert channel_nos == {1, 2}

    for ch in data:
        assert ch["stream_url"].endswith(f"/{ch['stream_path']}/whep")
        assert "mediamtx" in ch["stream_url"]


async def test_health_endpoint_degraded_fallback(
    client, auth_headers, device_with_channels, fake_redis
):
    device = device_with_channels
    # Seed a recent frame timestamp in Redis for the first channel.
    channel_path = f"device-{device.id}-ch1"
    await fake_redis.hset(
        "fleet:frame:latest",
        mapping={channel_path: datetime.now(timezone.utc).isoformat()},
    )

    response = await client.get(
        f"/api/devices/{device.id}/health", headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2

    by_channel = {ch["channel_no"]: ch for ch in data}
    assert by_channel[1]["state"] in {"degraded", "live", "idle", "offline"}
    assert by_channel[1]["label"] == "Front"
    assert by_channel[2]["label"] == "Rear"
