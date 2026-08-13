import json
from datetime import datetime, timezone

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.telemetry_point import TelemetryPoint
from app.models.vehicle import Vehicle
from app.models.vehicle_latest import VehicleLatest
from app.repositories import device_repository, telemetry_repository
from app.services.status_service import VehicleStatus, derive_status


async def ingest_telemetry(
    db: AsyncSession,
    redis: Redis,
    device_id: int,
    recorded_at: datetime,
    latitude: float,
    longitude: float,
    speed_kmh: float | None,
    heading_deg: float | None,
    ignition_on: bool | None,
) -> TelemetryPoint | None:
    """Ingest a telemetry point, update latest state, and publish to Redis.

    Duplicate or late packets (recorded_at not newer than the latest stored
    point for this device) are ignored and return None.
    """
    device = await device_repository.get(db, device_id)
    if device is None or device.vehicle_id is None:
        return None

    vehicle = await db.get(Vehicle, device.vehicle_id)
    if vehicle is None:
        return None

    latest = await telemetry_repository.get_latest_for_device(db, device_id)
    if latest is not None and recorded_at <= latest.recorded_at:
        return None

    received_at = datetime.now(timezone.utc)
    point = TelemetryPoint(
        device_id=device_id,
        recorded_at=recorded_at,
        received_at=received_at,
        latitude=latitude,
        longitude=longitude,
        speed_kmh=speed_kmh,
        heading_deg=heading_deg,
        ignition_on=ignition_on if ignition_on is not None else False,
    )
    db.add(point)
    await db.flush()

    fix_age_seconds = (received_at - recorded_at).total_seconds()
    status = derive_status(fix_age_seconds, speed_kmh)

    device.last_seen_at = received_at

    vehicle_latest = await db.get(VehicleLatest, device.vehicle_id)
    if vehicle_latest is None:
        vehicle_latest = VehicleLatest(vehicle_id=device.vehicle_id)
        db.add(vehicle_latest)

    vehicle_latest.device_id = device_id
    vehicle_latest.latitude = latitude
    vehicle_latest.longitude = longitude
    vehicle_latest.speed_kmh = speed_kmh
    vehicle_latest.heading_deg = heading_deg
    vehicle_latest.ignition_on = ignition_on
    vehicle_latest.recorded_at = recorded_at
    vehicle_latest.received_at = received_at
    vehicle_latest.status = status

    await db.flush()

    payload = {
        "device_id": device_id,
        "vehicle_id": device.vehicle_id,
        "latitude": latitude,
        "longitude": longitude,
        "speed_kmh": speed_kmh,
        "heading_deg": heading_deg,
        "ignition_on": ignition_on,
        "status": status.value,
        "recorded_at": recorded_at.isoformat(),
        "received_at": received_at.isoformat(),
    }
    await redis.publish("fleet:telemetry", json.dumps(payload))

    # Persist latest state to Redis hash for fast fleet reads.
    await redis.hset(
        "fleet:latest",
        mapping={
            str(device.vehicle_id): json.dumps(
                {
                    "vehicle_id": device.vehicle_id,
                    "registration_no": vehicle.registration_no if vehicle else None,
                    "vehicle_code": vehicle.vehicle_code if vehicle else None,
                    "vehicle_type": vehicle.vehicle_type.value if vehicle else None,
                    "latitude": latitude,
                    "longitude": longitude,
                    "speed_kmh": speed_kmh,
                    "heading_deg": heading_deg,
                    "ignition_on": ignition_on,
                    "status": status.value,
                    "recorded_at": recorded_at.isoformat(),
                    "received_at": received_at.isoformat(),
                    "source": device.source.value,
                    "connection_status": device.connection_status.value,
                }
            )
        },
    )

    return point
