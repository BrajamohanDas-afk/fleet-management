from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.device import Protocol


class DeviceChannelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    device_id: int
    channel_no: int
    label: str
    stream_path: str | None = None
    stream_url: str | None = None


class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    vehicle_id: int | None = None
    device_serial: str
    sim_number: str
    protocol: Protocol
    last_seen_at: datetime | None = None
    channels: list[DeviceChannelOut] = []


class DeviceChannelHealthOut(BaseModel):
    channel_no: int
    label: str
    state: str
    last_frame_at: datetime | None = None
