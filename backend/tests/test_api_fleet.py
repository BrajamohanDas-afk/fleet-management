import json
from datetime import datetime, timezone

import pytest


@pytest.fixture
async def fleet_redis_state(fake_redis):
    positions = [
        {
            "vehicle_id": 1,
            "registration_no": "TS09AB1234",
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
            "registration_no": "TS09CD5678",
            "vehicle_code": "VH002",
            "vehicle_type": "car",
            "latitude": 17.41,
            "longitude": 78.51,
            "speed_kmh": 0.0,
            "heading_deg": 0.0,
            "status": "standing",
            "recorded_at": datetime.now(timezone.utc).isoformat(),
            "received_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "vehicle_id": 3,
            "registration_no": "TS09EF9012",
            "vehicle_code": "VH003",
            "vehicle_type": "truck",
            "latitude": 18.0,
            "longitude": 79.0,
            "speed_kmh": 0.0,
            "heading_deg": 0.0,
            "status": "offline",
            "recorded_at": datetime.now(timezone.utc).isoformat(),
            "received_at": datetime.now(timezone.utc).isoformat(),
        },
    ]
    await fake_redis.hset(
        "fleet:latest",
        mapping={str(p["vehicle_id"]): json.dumps(p) for p in positions},
    )
    return positions


async def test_positions(client, auth_headers, fleet_redis_state):
    response = await client.get("/api/fleet/positions", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 3
    ids = {p["vehicle_id"] for p in data}
    assert ids == {1, 2, 3}


async def test_positions_status_filter(client, auth_headers, fleet_redis_state):
    response = await client.get(
        "/api/fleet/positions?status=moving", headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["status"] == "moving"


async def test_positions_q_filter(client, auth_headers, fleet_redis_state):
    response = await client.get(
        "/api/fleet/positions?q=VH002", headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["vehicle_code"] == "VH002"


async def test_positions_bbox_filter(client, auth_headers, fleet_redis_state):
    # Bbox around Hyderabad should include vehicles 1 and 2 but not 3.
    bbox = "17.35,78.45,17.45,78.55"
    response = await client.get(
        f"/api/fleet/positions?bbox={bbox}", headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    ids = {p["vehicle_id"] for p in data}
    assert ids == {1, 2}


async def test_positions_invalid_bbox(client, auth_headers):
    response = await client.get(
        "/api/fleet/positions?bbox=invalid", headers=auth_headers
    )
    assert response.status_code == 422
