from datetime import datetime, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device, DeviceSource, Protocol
from app.models.share_link import ShareLink
from app.models.vehicle import LicenseStatus, Vehicle, VehicleType
from app.models.vehicle_latest import VehicleLatest
from app.services.status_service import VehicleStatus


@pytest.fixture
async def sample_vehicles(clean_db, db: AsyncSession):
    vehicles = []
    statuses = [VehicleStatus.moving, VehicleStatus.standing, VehicleStatus.offline]
    for i, reg in enumerate(["TEST001", "TEST002", "TEST003"]):
        v = Vehicle(
            registration_no=reg,
            vehicle_code=f"V{i+1:03d}",
            vehicle_type=VehicleType.car if i < 2 else VehicleType.truck,
            license_status=LicenseStatus.valid,
            license_expiry=None,
        )
        db.add(v)
        await db.flush()
        vehicles.append(v)

        db.add(
            VehicleLatest(
                vehicle_id=v.id,
                device_id=None,
                status=statuses[i],
                latitude=17.4 + i * 0.01,
                longitude=78.5 + i * 0.01,
                speed_kmh=float(i * 10),
            )
        )

    await db.flush()
    return vehicles


async def test_list_vehicles(client, auth_headers, sample_vehicles):
    response = await client.get("/api/vehicles", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 3
    ids = {v["id"] for v in data}
    assert ids == {v.id for v in sample_vehicles}


async def test_create_vehicle(client, auth_headers):
    payload = {
        "registration_no": "NEW001",
        "vehicle_code": "VN001",
        "vehicle_type": "car",
        "speed_limit_kmh": 80.0,
        "license_status": "valid",
    }
    response = await client.post("/api/vehicles", json=payload, headers=auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["registration_no"] == "NEW001"
    assert data["vehicle_code"] == "VN001"
    assert data["vehicle_type"] == "car"

    # Verify persistence via GET.
    get_response = await client.get(f"/api/vehicles/{data['id']}", headers=auth_headers)
    assert get_response.status_code == 200
    assert get_response.json()["registration_no"] == "NEW001"


async def test_create_vehicle_duplicate_registration(
    client, auth_headers, sample_vehicles
):
    payload = {
        "registration_no": "TEST001",
        "vehicle_code": "DUPLICATE",
        "vehicle_type": "car",
        "license_status": "valid",
    }
    response = await client.post("/api/vehicles", json=payload, headers=auth_headers)
    assert response.status_code == 409


async def test_get_vehicle(client, auth_headers, sample_vehicles):
    v = sample_vehicles[0]
    response = await client.get(f"/api/vehicles/{v.id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == v.id
    assert data["registration_no"] == v.registration_no
    assert data["latest"]["status"] == "moving"


async def test_update_vehicle(client, auth_headers, sample_vehicles, db: AsyncSession):
    v = sample_vehicles[0]
    payload = {"speed_limit_kmh": 120.0}
    response = await client.patch(
        f"/api/vehicles/{v.id}", json=payload, headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["speed_limit_kmh"] == 120.0

    await db.refresh(v)
    assert v.speed_limit_kmh == 120.0


async def test_delete_vehicle(client, auth_headers, sample_vehicles, db: AsyncSession):
    v = sample_vehicles[0]
    response = await client.delete(f"/api/vehicles/{v.id}", headers=auth_headers)
    assert response.status_code == 204

    deleted = await db.get(Vehicle, v.id)
    assert deleted is None


async def test_delete_vehicle_with_tracker_dependencies(
    client, auth_headers, sample_vehicles, db: AsyncSession, fake_redis
):
    v = sample_vehicles[0]
    device = Device(
        vehicle_id=v.id,
        device_serial="tracker-delete-test",
        sim_number="n/a",
        protocol=Protocol.other,
        source=DeviceSource.simulator,
        external_device_identifier="delete-test-phone",
    )
    db.add(device)
    await db.flush()

    latest = await db.get(VehicleLatest, v.id)
    latest.device_id = device.id
    db.add(
        ShareLink(
            token_hash="delete-test-token",
            vehicle_id=v.id,
            created_by="admin",
            expires_at=datetime.now(timezone.utc),
        )
    )
    await fake_redis.hset("fleet:latest", str(v.id), "{}")
    await db.flush()

    response = await client.delete(f"/api/vehicles/{v.id}", headers=auth_headers)
    assert response.status_code == 204

    assert await db.get(Vehicle, v.id) is None
    assert await db.get(Device, device.id) is None
    assert await fake_redis.hget("fleet:latest", str(v.id)) is None


async def test_search_vehicles(client, auth_headers, sample_vehicles):
    response = await client.get(
        "/api/vehicles?q=TEST001", headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["registration_no"] == "TEST001"

    response = await client.get("/api/vehicles?q=V002", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["vehicle_code"] == "V002"


async def test_status_filter(client, auth_headers, sample_vehicles):
    response = await client.get(
        "/api/vehicles?status=moving", headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["latest"]["status"] == "moving"


async def test_type_filter(client, auth_headers, sample_vehicles):
    response = await client.get("/api/vehicles?type=truck", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["vehicle_type"] == "truck"


async def test_create_vehicle_with_device_returns_enriched_device_info(client, auth_headers):
    payload = {
        "registration_no": "NEWCAM001",
        "vehicle_code": "VCAM001",
        "vehicle_type": "car",
        "speed_limit_kmh": 80.0,
        "license_status": "valid",
        "device": {
            "device_serial": "newcam-device-001",
            "sim_number": "9000001001",
            "protocol": "other",
            "cameras": [
                {
                    "channel_no": 1,
                    "label": "Front",
                    "rtsp_url": "rtsp://127.0.0.1:554/front",
                }
            ],
        },
    }

    response = await client.post("/api/vehicles", json=payload, headers=auth_headers)

    assert response.status_code == 201
    data = response.json()
    assert data["device_id"] is not None
    assert data["device_serial"] == "newcam-device-001"
    assert data["sim_number"] == "9000001001"
    assert data["latest"]["device_id"] == data["device_id"]


async def test_update_vehicle_with_device_returns_enriched_device_info(
    client, auth_headers, sample_vehicles
):
    vehicle = sample_vehicles[0]
    payload = {
        "device": {
            "device_serial": "updated-device-001",
            "sim_number": "9000001002",
            "protocol": "other",
            "cameras": [
                {
                    "channel_no": 1,
                    "label": "Front",
                    "rtsp_url": "rtsp://127.0.0.1:554/front",
                }
            ],
        }
    }

    response = await client.patch(
        f"/api/vehicles/{vehicle.id}", json=payload, headers=auth_headers
    )

    assert response.status_code == 200
    data = response.json()
    assert data["device_id"] is not None
    assert data["device_serial"] == "updated-device-001"
    assert data["sim_number"] == "9000001002"
    assert data["latest"]["device_id"] == data["device_id"]


async def test_vehicle_response_prefers_device_with_sim_for_display(
    client, auth_headers, sample_vehicles, db: AsyncSession
):
    vehicle = sample_vehicles[0]
    tracker_device = Device(
        vehicle_id=vehicle.id,
        device_serial="tracker-without-sim",
        sim_number="",
        protocol=Protocol.other,
        source=DeviceSource.simulator,
        external_device_identifier="tracker-without-sim",
    )
    camera_device = Device(
        vehicle_id=vehicle.id,
        device_serial="camera-device-with-sim",
        sim_number="9000001999",
        protocol=Protocol.other,
        source=DeviceSource.simulator,
    )
    db.add_all([tracker_device, camera_device])
    await db.flush()

    latest = await db.get(VehicleLatest, vehicle.id)
    latest.device_id = tracker_device.id
    await db.commit()

    response = await client.get(f"/api/vehicles/{vehicle.id}", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["device_id"] == camera_device.id
    assert data["device_serial"] == "camera-device-with-sim"
    assert data["sim_number"] == "9000001999"
    assert data["latest"]["device_id"] == tracker_device.id
