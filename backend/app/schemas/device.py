from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.device import ConnectionStatus, DeviceSource, Protocol


class DeviceCreate(BaseModel):
    device_serial: str
    sim_number: str = ""
    protocol: Protocol = Protocol.other
    source: DeviceSource = DeviceSource.simulator
    external_device_id: int | None = None
    external_device_identifier: str | None = None


class DeviceUpdate(BaseModel):
    vehicle_id: int | None = None
    device_serial: str | None = None
    sim_number: str | None = None
    protocol: Protocol | None = None
    source: DeviceSource | None = None
    external_device_id: int | None = None
    external_device_identifier: str | None = None


class DeviceChannelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    device_id: int
    channel_no: int
    label: str
    stream_path: str | None = None
    stream_url: str | None = None
    rtsp_url: str | None = None
    source_type: str = "rtsp"
    source_format: str = "rtsp"
    http_stream_url: str | None = None


class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    vehicle_id: int | None = None
    device_serial: str
    sim_number: str
    protocol: Protocol
    last_seen_at: datetime | None = None
    source: DeviceSource
    external_device_id: int | None = None
    external_device_identifier: str | None = None
    connection_status: ConnectionStatus
    last_external_sync_at: datetime | None = None
    channels: list[DeviceChannelOut] = []


class DeviceChannelHealthOut(BaseModel):
    channel_no: int
    label: str
    state: str
    last_frame_at: datetime | None = None
