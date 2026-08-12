from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RecordingCreate(BaseModel):
    channel_no: int
    duration_s: int = Field(default=60, ge=1, le=300)


class RecordingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    device_id: int
    channel_no: int
    started_at: datetime
    ended_at: datetime | None = None
    file_path: str
    size_bytes: int | None = None
