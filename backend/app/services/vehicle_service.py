from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.device import Device
from app.models.vehicle import Vehicle, VehicleType
from app.models.vehicle_latest import VehicleLatest
from app.schemas.vehicle import VehicleLatestOut, VehicleWithLatest


def _select_vehicle_device(vehicle: Vehicle, latest: VehicleLatest | None) -> Device | None:
    devices = list(vehicle.devices or [])
    if not devices:
        return None
    if latest and latest.device_id is not None:
        for device in devices:
            if device.id == latest.device_id:
                return device
    return devices[0]


async def _vehicle_with_latest(vehicle: Vehicle, latest: VehicleLatest | None) -> VehicleWithLatest:
    device = _select_vehicle_device(vehicle, latest)
    return VehicleWithLatest(
        id=vehicle.id,
        registration_no=vehicle.registration_no,
        vehicle_code=vehicle.vehicle_code,
        vehicle_type=vehicle.vehicle_type,
        speed_limit_kmh=vehicle.speed_limit_kmh,
        license_status=vehicle.license_status,
        license_expiry=vehicle.license_expiry,
        created_at=vehicle.created_at,
        latest=VehicleLatestOut.model_validate(latest) if latest else None,
        device_id=device.id if device else (latest.device_id if latest else None),
        device_serial=device.device_serial if device else None,
        sim_number=device.sim_number if device else None,
    )


async def get_vehicles_with_latest(
    db: AsyncSession,
    *,
    status: str | None = None,
    q: str | None = None,
    vehicle_type: str | None = None,
) -> list[VehicleWithLatest]:
    stmt = select(Vehicle).options(joinedload(Vehicle.latest), joinedload(Vehicle.devices))

    if status:
        stmt = stmt.join(VehicleLatest).where(VehicleLatest.status == status)
    else:
        stmt = stmt.outerjoin(VehicleLatest)

    if vehicle_type:
        stmt = stmt.where(Vehicle.vehicle_type == VehicleType(vehicle_type))

    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(
            (Vehicle.registration_no.ilike(pattern))
            | (Vehicle.vehicle_code.ilike(pattern))
        )

    stmt = stmt.order_by(Vehicle.id)
    result = await db.execute(stmt)
    vehicles = result.unique().scalars().all()

    return [await _vehicle_with_latest(v, v.latest) for v in vehicles]


async def get_vehicle_with_latest(
    db: AsyncSession, vehicle_id: int
) -> VehicleWithLatest | None:
    stmt = (
        select(Vehicle)
        .options(joinedload(Vehicle.latest), joinedload(Vehicle.devices))
        .outerjoin(VehicleLatest)
        .where(Vehicle.id == vehicle_id)
    )
    result = await db.execute(stmt)
    vehicle = result.unique().scalar_one_or_none()
    if vehicle is None:
        return None
    return await _vehicle_with_latest(vehicle, vehicle.latest)
