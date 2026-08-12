from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.vehicle import VehicleType
from app.services.status_service import VehicleStatus


class FleetPositionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    vehicle_id: int
    registration_no: str
    vehicle_code: str
    vehicle_type: VehicleType
    latitude: float | None = None
    longitude: float | None = None
    speed_kmh: float | None = None
    heading_deg: float | None = None
    ignition_on: bool | None = None
    status: VehicleStatus
    recorded_at: datetime | None = None
    received_at: datetime | None = None
