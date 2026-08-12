import asyncio
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.vehicle import Vehicle, VehicleType, LicenseStatus
from app.models.device import Device, Protocol
from app.models.device_channel import DeviceChannel
from app.models.vehicle_latest import VehicleLatest, VehicleStatus


SEED_VEHICLES = [
    {
        "registration_no": "TS09AB1234",
        "vehicle_code": "VH001",
        "vehicle_type": VehicleType.car,
        "speed_limit_kmh": 80.0,
        "license_status": LicenseStatus.valid,
        "license_expiry": None,
        "device_serial": "DEV001",
        "sim_number": "9000000001",
        "channels": [(1, "Front"), (2, "Rear")],
    },
    {
        "registration_no": "TS09CD5678",
        "vehicle_code": "VH002",
        "vehicle_type": VehicleType.car,
        "speed_limit_kmh": 80.0,
        "license_status": LicenseStatus.valid,
        "license_expiry": None,
        "device_serial": "DEV002",
        "sim_number": "9000000002",
        "channels": [(1, "Front"), (2, "Rear")],
    },
    {
        "registration_no": "TS09EF9012",
        "vehicle_code": "VH003",
        "vehicle_type": VehicleType.truck,
        "speed_limit_kmh": 60.0,
        "license_status": LicenseStatus.valid,
        "license_expiry": None,
        "device_serial": "DEV003",
        "sim_number": "9000000003",
        "channels": [(1, "Front"), (2, "Rear")],
    },
    {
        "registration_no": "TS09GH3456",
        "vehicle_code": "VH004",
        "vehicle_type": VehicleType.bike,
        "speed_limit_kmh": 40.0,
        "license_status": LicenseStatus.valid,
        "license_expiry": None,
        "device_serial": "DEV004",
        "sim_number": "9000000004",
        "channels": [(1, "Front"), (2, "Cabin")],
    },
    {
        "registration_no": "TS09IJ7890",
        "vehicle_code": "VH005",
        "vehicle_type": VehicleType.bus,
        "speed_limit_kmh": 70.0,
        "license_status": LicenseStatus.valid,
        "license_expiry": None,
        "device_serial": "DEV005",
        "sim_number": "9000000005",
        "channels": [(1, "Front"), (2, "Rear")],
    },
]


async def seed(session: AsyncSession) -> None:
    for data in SEED_VEHICLES:
        existing = await session.scalar(
            select(Vehicle).where(Vehicle.registration_no == data["registration_no"])
        )
        if existing:
            continue

        vehicle = Vehicle(
            registration_no=data["registration_no"],
            vehicle_code=data["vehicle_code"],
            vehicle_type=data["vehicle_type"],
            speed_limit_kmh=data["speed_limit_kmh"],
            license_status=data["license_status"],
            license_expiry=data["license_expiry"],
            created_at=datetime.now(timezone.utc),
        )
        session.add(vehicle)
        await session.flush()

        device = Device(
            vehicle_id=vehicle.id,
            device_serial=data["device_serial"],
            sim_number=data["sim_number"],
            protocol=Protocol.sim,
            last_seen_at=None,
        )
        session.add(device)
        await session.flush()

        for channel_no, label in data["channels"]:
            session.add(
                DeviceChannel(
                    device_id=device.id,
                    channel_no=channel_no,
                    label=label,
                    stream_path=f"device-{device.id}-ch{channel_no}",
                )
            )

        session.add(
            VehicleLatest(
                vehicle_id=vehicle.id,
                device_id=device.id,
                status=VehicleStatus.offline,
            )
        )

    await session.commit()
    print("Seeded 5 vehicles, devices, channels, and latest records.")


async def main() -> None:
    async with AsyncSessionLocal() as session:
        await seed(session)


if __name__ == "__main__":
    asyncio.run(main())
