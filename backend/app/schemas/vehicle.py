from datetime import date, datetime

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.vehicle import LicenseStatus, VehicleType
from app.services.camera_source_service import (
    SOURCE_TYPE_HTTP,
    SOURCE_TYPE_RTSP,
    normalize_source_format,
    normalize_source_type,
    validate_camera_source_url,
)
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
    source_type: str | None = None
    source_format: str | None = Field(default=None, validation_alias=AliasChoices("source_format", "http_format"))

    @model_validator(mode="after")
    def normalize_camera_source(self) -> "VehicleCameraCreate":
        self.source_type = normalize_source_type(self.source_type, self.rtsp_url)
        self.source_format = normalize_source_format(self.source_type, self.source_format)
        self.rtsp_url = validate_camera_source_url(self.rtsp_url, source_type=self.source_type)
        return self


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
    source_type: str | None = None
    source_format: str | None = Field(default=None, validation_alias=AliasChoices("source_format", "http_format"))

    @model_validator(mode="after")
    def normalize_camera_source(self) -> "CameraUpdateItem":
        self.source_type = normalize_source_type(self.source_type, self.rtsp_url)
        self.source_format = normalize_source_format(self.source_type, self.source_format)
        self.rtsp_url = validate_camera_source_url(self.rtsp_url, source_type=self.source_type)
        return self


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
    source_type: str | None = None
    source_format: str | None = Field(default=None, validation_alias=AliasChoices("source_format", "http_format"))

    @model_validator(mode="after")
    def normalize_camera_source(self) -> "CameraTestRequest":
        self.source_type = normalize_source_type(self.source_type, self.rtsp_url)
        self.source_format = normalize_source_format(self.source_type, self.source_format)
        self.rtsp_url = validate_camera_source_url(self.rtsp_url, source_type=self.source_type)
        return self


class CameraTestResponse(BaseModel):
    status: str
    detail: str | None = None
    source_type: str | None = None
    source_format: str | None = Field(default=None, validation_alias=AliasChoices("source_format", "http_format"))


class VehicleSummaryOut(BaseModel):
    total: int
    licensed: int
    needs_renewal: int
    types: dict[str, int]
