from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.models.vehicle import LicenseStatus, VehicleType
from app.services.status_service import VehicleStatus


class VehicleBase(BaseModel):
    registration_no: str
    vehicle_code: str
    vehicle_type: VehicleType
    speed_limit_kmh: float | None = None
    license_status: LicenseStatus
    license_expiry: date | None = None


class VehicleCreate(VehicleBase):
    pass


class VehicleUpdate(BaseModel):
    registration_no: str | None = None
    vehicle_code: str | None = None
    vehicle_type: VehicleType | None = None
    speed_limit_kmh: float | None = None
    license_status: LicenseStatus | None = None
    license_expiry: date | None = None


class VehicleOut(VehicleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class VehicleLatestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    vehicle_id: int
    device_id: int | None = None
    latitude: float | None = None
    longitude: float | None = None
    speed_kmh: float | None = None
    heading_deg: float | None = None
    ignition_on: bool | None = None
    recorded_at: datetime | None = None
    received_at: datetime | None = None
    status: VehicleStatus


class VehicleWithLatest(VehicleOut):
    latest: VehicleLatestOut | None = None


class VehicleSummaryOut(BaseModel):
    total: int
    licensed: int
    needs_renewal: int
    types: dict[str, int]
