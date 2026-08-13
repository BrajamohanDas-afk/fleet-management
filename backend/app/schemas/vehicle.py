from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.vehicle import LicenseStatus, VehicleType
from app.services.rtsp_service import validate_rtsp_url
from app.services.status_service import VehicleStatus


class VehicleBase(BaseModel):
    registration_no: str
    vehicle_code: str
    vehicle_type: VehicleType
    speed_limit_kmh: float | None = None
    license_status: LicenseStatus
    license_expiry: date | None = None


class VehicleCreate(VehicleBase):
    device: "VehicleDeviceCreate | None" = None


class VehicleCameraCreate(BaseModel):
    channel_no: int = Field(ge=1, le=64)
    label: str = Field(min_length=1, max_length=64)
    rtsp_url: str = Field(min_length=8, max_length=2048)

    @field_validator("rtsp_url")
    @classmethod
    def normalize_rtsp_url(cls, value: str) -> str:
        return validate_rtsp_url(value)


class VehicleDeviceCreate(BaseModel):
    device_serial: str = Field(min_length=1, max_length=64)
    sim_number: str = Field(min_length=1, max_length=32)
    protocol: str = "other"
    cameras: list[VehicleCameraCreate] = Field(min_length=1, max_length=64)

    @field_validator("cameras")
    @classmethod
    def unique_channel_numbers(cls, value: list[VehicleCameraCreate]) -> list[VehicleCameraCreate]:
        if len({camera.channel_no for camera in value}) != len(value):
            raise ValueError("Each camera must use a different channel number")
        return value


class VehicleDeviceUpdate(BaseModel):
    device_serial: str | None = Field(default=None, min_length=1, max_length=64)
    sim_number: str | None = Field(default=None, min_length=1, max_length=32)
    protocol: str | None = None
    cameras: list[VehicleCameraCreate] | None = Field(default=None, max_length=64)

    @field_validator("cameras")
    @classmethod
    def unique_channel_numbers(
        cls, value: list[VehicleCameraCreate] | None
    ) -> list[VehicleCameraCreate] | None:
        if value is None:
            return value
        if len({camera.channel_no for camera in value}) != len(value):
            raise ValueError("Each camera must use a different channel number")
        return value


class VehicleUpdate(BaseModel):
    registration_no: str | None = None
    vehicle_code: str | None = None
    vehicle_type: VehicleType | None = None
    speed_limit_kmh: float | None = None
    license_status: LicenseStatus | None = None
    license_expiry: date | None = None
    device: VehicleDeviceUpdate | None = None


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
    device_id: int | None = None
    device_serial: str | None = None
    sim_number: str | None = None


class CameraUpdateItem(BaseModel):
    channel_no: int = Field(ge=1, le=64)
    label: str | None = Field(default=None, min_length=1, max_length=64)
    rtsp_url: str = Field(min_length=8, max_length=2048)

    @field_validator("rtsp_url")
    @classmethod
    def normalize_rtsp_url(cls, value: str) -> str:
        return validate_rtsp_url(value)


class CameraUpdatePayload(BaseModel):
    cameras: list[CameraUpdateItem] = Field(default_factory=list, max_length=64)

    @field_validator("cameras")
    @classmethod
    def unique_channel_numbers(cls, value: list[CameraUpdateItem]) -> list[CameraUpdateItem]:
        if len({camera.channel_no for camera in value}) != len(value):
            raise ValueError("Each camera must use a different channel number")
        return value


class CameraTestRequest(BaseModel):
    rtsp_url: str = Field(min_length=8, max_length=2048)

    @field_validator("rtsp_url")
    @classmethod
    def normalize_rtsp_url(cls, value: str) -> str:
        return validate_rtsp_url(value)


class CameraTestResponse(BaseModel):
    status: str
    detail: str | None = None


class VehicleSummaryOut(BaseModel):
    total: int
    licensed: int
    needs_renewal: int
    types: dict[str, int]
