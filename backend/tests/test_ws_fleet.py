import asyncio
import json
from datetime import datetime, timezone

import pytest_asyncio
from async_asgi_testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.main import app
from app.models.device import Device, Protocol
from app.models.vehicle import LicenseStatus, Vehicle, VehicleType
from app.models.vehicle_latest import VehicleLatest
from app.services.fleet_ws_service import stop
from app.services.telemetry_service import ingest_telemetry


@pytest_asyncio.fixture(autouse=True)
async def _reset_fleet_ws_service():
    """Ensure no leaked listener tasks or connections between tests."""
    yield
    await stop()


@pytest_asyncio.fixture
async def ws_client(db: AsyncSession):
    """Async ASGI test client with the DB dependency wired to the test transaction."""
    app.dependency_overrides[get_db] = lambda: db
    async with TestClient(app) as client:
        yield client
    app.dependency_overrides.pop(get_db, None)


@pytest_asyncio.fixture
async def vehicle_and_device(clean_db: AsyncSession):
    """Seed a vehicle, device, and empty vehicle_latest row for ingest tests."""
    db = clean_db
    vehicle = Vehicle(
        registration_no="WS1234",
        vehicle_code="VWS01",
        vehicle_type=VehicleType.car,
        license_status=LicenseStatus.valid,
        license_expiry=None,
    )
    db.add(vehicle)
    await db.flush()

    device = Device(
        vehicle_id=vehicle.id,
        device_serial="DEVWS01",
        sim_number="9000000001",
        protocol=Protocol.sim,
        last_seen_at=None,
    )
    db.add(device)
    await db.flush()

    db.add(VehicleLatest(vehicle_id=vehicle.id, device_id=device.id))
    await db.flush()

    return vehicle, device


async def _drain_snapshot(ws):
    msg = await asyncio.wait_for(ws.receive_json(), timeout=5)
    assert msg["type"] == "snapshot"
    return msg["data"]


async def _wait_for_subscriptions(fake_redis, count=1, timeout=2):
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        subs = fake_redis._pubsubs.get("fleet:telemetry", [])
        if len(subs) >= count:
            return
        await asyncio.sleep(0.05)
    raise TimeoutError("Redis pub/sub subscription was not established in time")


async def test_connect_receives_snapshot(ws_client, fake_redis):
    positions = [
        {
            "vehicle_id": 1,
            "registration_no": "TS09AB1111",
            "vehicle_code": "VH001",
            "vehicle_type": "car",
            "latitude": 17.4,
            "longitude": 78.5,
            "speed_kmh": 45.0,
            "heading_deg": 90.0,
            "status": "moving",
            "recorded_at": datetime.now(timezone.utc).isoformat(),
            "received_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "vehicle_id": 2,
            "registration_no": "TS09AB2222",
            "vehicle_code": "VH002",
            "vehicle_type": "truck",
            "latitude": 17.41,
            "longitude": 78.51,
            "speed_kmh": 0.0,
            "heading_deg": 0.0,
            "status": "standing",
            "recorded_at": datetime.now(timezone.utc).isoformat(),
            "received_at": datetime.now(timezone.utc).isoformat(),
        },
    ]
    await fake_redis.hset(
        "fleet:latest",
        mapping={str(p["vehicle_id"]): json.dumps(p) for p in positions},
    )

    async with ws_client.websocket_connect("/ws/fleet/positions") as ws:
        data = await _drain_snapshot(ws)
        assert len(data) == 2
        ids = {p["vehicle_id"] for p in data}
        assert ids == {1, 2}


async def test_ingest_telemetry_broadcasts_update(
    ws_client, fake_redis, vehicle_and_device, clean_db
):
    vehicle, device = vehicle_and_device

    async with ws_client.websocket_connect("/ws/fleet/positions") as ws:
        await _drain_snapshot(ws)
        await _wait_for_subscriptions(fake_redis)

        recorded_at = datetime.now(timezone.utc)
        await ingest_telemetry(
            clean_db,
            fake_redis,
            device.id,
            recorded_at,
            latitude=17.4,
            longitude=78.5,
            speed_kmh=45.0,
            heading_deg=90.0,
            ignition_on=True,
        )

        msg = await asyncio.wait_for(ws.receive_json(), timeout=5)
        assert msg["type"] == "update"
        data = msg["data"]
        assert data["vehicle_id"] == vehicle.id
        assert data["registration_no"] == vehicle.registration_no
        assert data["vehicle_code"] == vehicle.vehicle_code
        assert data["vehicle_type"] == vehicle.vehicle_type.value
        assert data["latitude"] == 17.4
        assert data["longitude"] == 78.5
        assert data["speed_kmh"] == 45.0
        assert data["heading_deg"] == 90.0
        assert data["ignition_on"] is True
        assert data["status"] == "moving"


async def test_multiple_clients_receive_same_update(ws_client, fake_redis):
    position = {
        "vehicle_id": 10,
        "registration_no": "TS09AB3333",
        "vehicle_code": "VH003",
        "vehicle_type": "bike",
        "latitude": 18.0,
        "longitude": 79.0,
        "speed_kmh": 30.0,
        "heading_deg": 180.0,
        "ignition_on": True,
        "status": "moving",
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "received_at": datetime.now(timezone.utc).isoformat(),
    }
    await fake_redis.hset(
        "fleet:latest",
        mapping={str(position["vehicle_id"]): json.dumps(position)},
    )

    async with ws_client.websocket_connect("/ws/fleet/positions") as ws1:
        async with ws_client.websocket_connect("/ws/fleet/positions") as ws2:
            await _drain_snapshot(ws1)
            await _drain_snapshot(ws2)
            await _wait_for_subscriptions(fake_redis, count=1)

            await fake_redis.publish(
                "fleet:telemetry", json.dumps({"vehicle_id": 10})
            )

            msg1 = await asyncio.wait_for(ws1.receive_json(), timeout=5)
            msg2 = await asyncio.wait_for(ws2.receive_json(), timeout=5)

            assert msg1 == msg2
            assert msg1["type"] == "update"
            assert msg1["data"]["vehicle_id"] == 10
            assert msg1["data"]["registration_no"] == position["registration_no"]
