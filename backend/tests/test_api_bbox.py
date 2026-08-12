import json
from datetime import datetime, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device, Protocol
from app.models.vehicle import LicenseStatus, Vehicle, VehicleType


@pytest.fixture
async def bbox_vehicles(clean_db: AsyncSession, fake_redis):
    vehicles = []
    coords = [
        (17.385, 78.486),  # inside Hyderabad bbox
        (0.0, 0.0),        # outside Hyderabad bbox
    ]
    for i, (lat, lon) in enumerate(coords):
        v = Vehicle(
            registration_no=f"BBOX{i+1:03d}",
            vehicle_code=f"VB{i+1:03d}",
            vehicle_type=VehicleType.car,
            license_status=LicenseStatus.valid,
        )
        clean_db.add(v)
        await clean_db.flush()
        vehicles.append(v)

        d = Device(
            vehicle_id=v.id,
            device_serial=f"BBOXSR{i+1:03d}",
            sim_number=f"90000001{i:02d}",
            protocol=Protocol.sim,
        )
        clean_db.add(d)
        await clean_db.flush()

        await fake_redis.hset(
            "fleet:latest",
            mapping={
                str(v.id): json.dumps(
                    {
                        "vehicle_id": v.id,
                        "registration_no": v.registration_no,
                        "vehicle_code": v.vehicle_code,
                        "vehicle_type": "car",
                        "latitude": lat,
                        "longitude": lon,
                        "speed_kmh": 0.0,
                        "heading_deg": 0.0,
                        "status": "standing",
                        "recorded_at": datetime.now(timezone.utc).isoformat(),
                        "received_at": datetime.now(timezone.utc).isoformat(),
                    }
                )
            },
        )

    return vehicles


async def test_positions_bbox_returns_only_inside_vehicle(client, auth_headers, bbox_vehicles):
    response = await client.get(
        "/api/fleet/positions?bbox=17,78,18,79", headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    ids = {p["vehicle_id"] for p in data}
    assert ids == {bbox_vehicles[0].id}


async def test_positions_invalid_bbox_returns_422(client, auth_headers):
    response = await client.get(
        "/api/fleet/positions?bbox=invalid", headers=auth_headers
    )
    assert response.status_code == 422
