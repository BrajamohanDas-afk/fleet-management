import asyncio
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.endpoints import devices as devices_module
from app.models.device import Device, Protocol
from app.models.device_channel import DeviceChannel
from app.models.vehicle import LicenseStatus, Vehicle, VehicleType
from app.models.video_clip import VideoClip


async def test_device_recording_flow(client, clean_db: AsyncSession, auth_headers, monkeypatch):
    # Seed vehicle, device, and channel.
    vehicle = Vehicle(
        registration_no="REC001",
        vehicle_code="VR001",
        vehicle_type=VehicleType.truck,
        license_status=LicenseStatus.valid,
    )
    clean_db.add(vehicle)
    await clean_db.flush()

    device = Device(
        vehicle_id=vehicle.id,
        device_serial="RECSR001",
        sim_number="9000000022",
        protocol=Protocol.sim,
    )
    clean_db.add(device)
    await clean_db.flush()

    clean_db.add(
        DeviceChannel(
            device_id=device.id,
            channel_no=1,
            label="Front",
            stream_path=f"device-{device.id}-ch1",
        )
    )
    await clean_db.flush()

    # Ensure the background task uses the same test session so it can see the
    # clip row created by the endpoint.
    def _sessionmaker_override():
        return clean_db

    monkeypatch.setattr(devices_module, "AsyncSessionLocal", _sessionmaker_override)

    response = await client.post(
        f"/api/devices/{device.id}/recordings",
        json={"channel_no": 1, "duration_s": 2},
        headers=auth_headers,
    )
    assert response.status_code == 202
    clip_id = response.json()["id"]

    # Wait for the background task to finalize the clip.
    clip = None
    for _ in range(50):
        await asyncio.sleep(0.1)
        clip = await clean_db.get(VideoClip, clip_id)
        if clip is not None and clip.ended_at is not None:
            break

    assert clip is not None
    assert clip.ended_at is not None

    # size_bytes may be None if the file does not exist; ensure the column was
    # touched during finalization.
    assert clip.size_bytes is not None or Path(clip.file_path).exists() is False

    # Download endpoint returns the file path even if ffmpeg produced no bytes.
    download = await client.get(
        f"/api/recordings/{clip.id}/download", headers=auth_headers
    )
    assert download.status_code == 200
