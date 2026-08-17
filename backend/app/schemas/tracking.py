from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.tracking import LocationQuality, TrackingSessionStatus, TripStatus
from app.models.vehicle import VehicleType

MAX_CAPTURED_AT_FUTURE_SECONDS = 120


class TripCreate(BaseModel):
    vehicle_id: int
    driver_id: int | None = None
    driver_name: str | None = Field(default=None, max_length=128)
    driver_phone: str | None = Field(default=None, max_length=32)
    origin: str | None = Field(default=None, max_length=2048)
    destination: str | None = Field(default=None, max_length=2048)


class TripOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    vehicle_id: int
    driver_id: int | None = None
    driver_name: str | None = None
    driver_phone: str | None = None
    status: TripStatus
    origin: str | None = None
    destination: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    created_at: datetime


class TrackingSessionCreate(BaseModel):
    duration_minutes: int | None = Field(default=None, ge=1, le=10080)


class TrackingSessionExtend(BaseModel):
    duration_minutes: int = Field(ge=1, le=10080)


class TrackingSessionOut(BaseModel):
    id: int
    trip_id: int | None = None
    status: TrackingSessionStatus
    url: str
    expires_at: datetime
    revoked_at: datetime | None = None
    last_seen_at: datetime | None = None


class TrackingSessionStatusOut(BaseModel):
    id: int
    trip_id: int
    status: TrackingSessionStatus
    expires_at: datetime
    revoked_at: datetime | None = None
    last_seen_at: datetime | None = None


class LocationPointOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    sequence: int
    latitude: float
    longitude: float
    accuracy: float | None = None
    speed_device: float | None = None
    speed_calculated: float | None = None
    heading: float | None = None
    altitude: float | None = None
    captured_at: datetime
    received_at: datetime
    quality: LocationQuality


class TrackingLocationIn(BaseModel):
    session_token: str = Field(min_length=16)
    installation_id: str = Field(min_length=1, max_length=128)
    sequence: int = Field(ge=0)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy: float | None = Field(default=None, gt=0)
    speed: float | None = Field(default=None, ge=0)
    heading: float | None = Field(default=None, ge=0, le=360)
    altitude: float | None = None
    captured_at: datetime

    @field_validator("captured_at")
    @classmethod
    def captured_at_must_be_current(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("captured_at must include a timezone")
        now = datetime.now(timezone.utc)
        if value.astimezone(timezone.utc) > now.replace() + _future_limit():
            raise ValueError("captured_at is too far in the future")
        return value


class TrackingHeartbeatIn(BaseModel):
    session_token: str = Field(min_length=16)
    installation_id: str = Field(min_length=1, max_length=128)


class TrackingPermissionDeniedIn(TrackingHeartbeatIn):
    reason: str | None = Field(default=None, max_length=256)


class TrackingLatestOut(BaseModel):
    latitude: float | None = None
    longitude: float | None = None
    speed_kmh: float | None = None
    heading_deg: float | None = None
    status: str | None = None
    recorded_at: datetime | None = None
    received_at: datetime | None = None


class TrackingSessionSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    trip_id: int
    origin: str | None = None
    destination: str | None = None
    vehicle_id: int
    registration_no: str
    vehicle_code: str
    vehicle_type: VehicleType
    status: TrackingSessionStatus
    expires_at: datetime
    last_seen_at: datetime | None = None
    installation_bound: bool
    latest: TrackingLatestOut | None = None


class TrackingLocationOut(BaseModel):
    accepted: bool
    duplicate: bool
    sequence: int
    quality: LocationQuality | None = None


class TrackingActionOut(BaseModel):
    status: str


def _future_limit():
    from datetime import timedelta

    return timedelta(seconds=MAX_CAPTURED_AT_FUTURE_SECONDS)
