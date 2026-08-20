import json
from datetime import datetime, timezone

import pytest
from sqlalchemy import select
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
        assert ch["stream_url"].startswith("http://localhost:8890/")


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


async def test_channels_endpoint_exposes_http_source_metadata(
    client, auth_headers, device_with_channels, db: AsyncSession
):
    device = device_with_channels
    db.add(
        DeviceChannel(
            device_id=device.id,
            channel_no=3,
            label="HTTP Yard",
            rtsp_url="http://camera.local/mjpg/video.mjpg",
            source_type="http",
            source_format="mjpeg",
            stream_path=None,
        )
    )
    await db.flush()

    response = await client.get(
        f"/api/devices/{device.id}/channels", headers=auth_headers
    )

    assert response.status_code == 200
    by_channel = {ch["channel_no"]: ch for ch in response.json()}
    http_channel = by_channel[3]
    assert http_channel["source_type"] == "http"
    assert http_channel["source_format"] == "mjpeg"
    assert http_channel["stream_url"] is None
    assert http_channel["http_stream_url"] == f"/api/devices/{device.id}/channels/3/http-stream"


async def test_http_stream_endpoint_redirects_to_camera_relay(
    client, auth_headers, device_with_channels, db: AsyncSession
):
    device = device_with_channels
    db.add(
        DeviceChannel(
            device_id=device.id,
            channel_no=3,
            label="HTTP Yard",
            rtsp_url="http://camera.local/mjpg/video.mjpg",
            source_type="http",
            source_format="mjpeg",
            stream_path=None,
        )
    )
    await db.flush()

    response = await client.get(
        f"/api/devices/{device.id}/channels/3/http-stream",
        headers=auth_headers,
        follow_redirects=False,
    )

    assert response.status_code == 307
    assert response.headers["location"].startswith("/camera-relay/proxy?")
    assert "format=mjpeg" in response.headers["location"]


async def test_start_streams_skips_http_channels(
    client, auth_headers, device_with_channels, db: AsyncSession, fake_redis
):
    device = device_with_channels
    db.add(
        DeviceChannel(
            device_id=device.id,
            channel_no=3,
            label="RTSP Front",
            rtsp_url="rtsp://127.0.0.1:554/front",
            source_type="rtsp",
            source_format="rtsp",
            stream_path="rtsp-front",
        )
    )
    db.add(
        DeviceChannel(
            device_id=device.id,
            channel_no=4,
            label="HTTP Yard",
            rtsp_url="http://camera.local/mjpg/video.mjpg",
            source_type="http",
            source_format="mjpeg",
            stream_path=None,
        )
    )
    await db.flush()

    response = await client.post(
        f"/api/devices/{device.id}/streams/start", headers=auth_headers
    )

    assert response.status_code == 202
    assert response.json() == {"started": 1}
    messages = [json.loads(message) for channel, message in fake_redis.published]
    assert [message["channel"] for message in messages] == [3]
    assert messages[0]["rtsp_url"] == "rtsp://127.0.0.1:554/front"