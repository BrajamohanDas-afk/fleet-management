from datetime import datetime

from pydantic import BaseModel, Field


class ShareLinkCreate(BaseModel):
    duration_minutes: int = Field(default=60, ge=1, le=1440)


class ShareLinkOut(BaseModel):
    id: int
    url: str
    expires_at: datetime
    revoked_at: datetime | None = None


class PublicLocationOut(BaseModel):
    vehicle_id: int
    registration_no: str
    vehicle_code: str
    vehicle_type: str
    latitude: float | None = None
    longitude: float | None = None
    speed_kmh: float | None = None
    heading_deg: float | None = None
    ignition_on: bool | None = None
    status: str
    recorded_at: datetime | None = None
    received_at: datetime | None = None
    expires_at: datetime
