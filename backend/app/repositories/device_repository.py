from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device


async def get(db: AsyncSession, device_id: int) -> Device | None:
    return await db.get(Device, device_id)


async def get_multi(
    db: AsyncSession, skip: int = 0, limit: int = 100
) -> list[Device]:
    result = await db.execute(select(Device).offset(skip).limit(limit))
    return list(result.scalars().all())


async def create(db: AsyncSession, obj_in: dict) -> Device:
    device = Device(**obj_in)
    db.add(device)
    await db.flush()
    await db.refresh(device)
    return device


async def update(db: AsyncSession, db_obj: Device, obj_in: dict) -> Device:
    for field, value in obj_in.items():
        setattr(db_obj, field, value)
    await db.flush()
    await db.refresh(db_obj)
    return db_obj


async def delete(db: AsyncSession, db_obj: Device) -> None:
    await db.delete(db_obj)
    await db.flush()


async def get_by_serial(db: AsyncSession, device_serial: str) -> Device | None:
    result = await db.execute(
        select(Device).where(Device.device_serial == device_serial)
    )
    return result.scalar_one_or_none()


async def get_by_external_identifier(db: AsyncSession, identifier: str) -> Device | None:
    result = await db.execute(
        select(Device).where(Device.external_device_identifier == identifier)
    )
    return result.scalar_one_or_none()


async def get_by_external_id(db: AsyncSession, external_id: int) -> Device | None:
    result = await db.execute(select(Device).where(Device.external_device_id == external_id))
    return result.scalar_one_or_none()


async def get_by_vehicle(db: AsyncSession, vehicle_id: int) -> list[Device]:
    result = await db.execute(
        select(Device).where(Device.vehicle_id == vehicle_id)
    )
    return list(result.scalars().all())


async def update_last_seen(
    db: AsyncSession, device_id: int, seen_at: datetime
) -> Device | None:
    device = await get(db, device_id)
    if device is None:
        return None
    device.last_seen_at = seen_at
    await db.flush()
    await db.refresh(device)
    return device
