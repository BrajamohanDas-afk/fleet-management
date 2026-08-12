from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.vehicle import Vehicle, VehicleType, LicenseStatus
from app.services.license_service import needs_renewal


async def get(db: AsyncSession, vehicle_id: int) -> Vehicle | None:
    return await db.get(Vehicle, vehicle_id)


async def get_multi(
    db: AsyncSession, skip: int = 0, limit: int = 100
) -> list[Vehicle]:
    result = await db.execute(select(Vehicle).offset(skip).limit(limit))
    return list(result.scalars().all())


async def create(db: AsyncSession, obj_in: dict) -> Vehicle:
    vehicle = Vehicle(**obj_in)
    db.add(vehicle)
    await db.flush()
    await db.refresh(vehicle)
    return vehicle


async def update(db: AsyncSession, db_obj: Vehicle, obj_in: dict) -> Vehicle:
    for field, value in obj_in.items():
        setattr(db_obj, field, value)
    await db.flush()
    await db.refresh(db_obj)
    return db_obj


async def delete(db: AsyncSession, db_obj: Vehicle) -> None:
    await db.delete(db_obj)
    await db.flush()


async def get_by_registration(db: AsyncSession, registration_no: str) -> Vehicle | None:
    result = await db.execute(
        select(Vehicle).where(Vehicle.registration_no == registration_no)
    )
    return result.scalar_one_or_none()


async def count(db: AsyncSession) -> int:
    result = await db.execute(select(func.count()).select_from(Vehicle))
    return result.scalar() or 0


async def count_by_type(db: AsyncSession) -> dict[VehicleType, int]:
    result = await db.execute(
        select(Vehicle.vehicle_type, func.count())
        .group_by(Vehicle.vehicle_type)
    )
    return {row[0]: row[1] for row in result.all()}


async def count_licensed(db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(Vehicle)
        .where(Vehicle.license_status == LicenseStatus.valid)
    )
    return result.scalar() or 0


async def count_needs_renewal(db: AsyncSession) -> int:
    result = await db.execute(select(Vehicle))
    vehicles = result.scalars().all()
    return sum(1 for v in vehicles if needs_renewal(v.license_expiry))
