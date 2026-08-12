import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from redis.asyncio import Redis

from app.api.deps import get_current_user, get_redis
from app.models.vehicle import VehicleType
from app.schemas.fleet import FleetPositionOut
from app.services.status_service import VehicleStatus

router = APIRouter(prefix="/fleet", tags=["fleet"])


def _parse_bbox(bbox: str) -> tuple[float, float, float, float]:
    try:
        parts = [float(p.strip()) for p in bbox.split(",")]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="bbox must be four comma-separated numbers") from exc
    if len(parts) != 4:
        raise HTTPException(status_code=400, detail="bbox must contain exactly four values: sw_lat,sw_lon,ne_lat,ne_lon")
    sw_lat, sw_lon, ne_lat, ne_lon = parts
    if not (-90 <= sw_lat <= 90 and -90 <= ne_lat <= 90):
        raise HTTPException(status_code=400, detail="bbox latitude values must be between -90 and 90")
    if not (-180 <= sw_lon <= 180 and -180 <= ne_lon <= 180):
        raise HTTPException(status_code=400, detail="bbox longitude values must be between -180 and 180")
    return sw_lat, sw_lon, ne_lat, ne_lon


def _inside_bbox(lat: float, lon: float, bbox: tuple[float, float, float, float]) -> bool:
    sw_lat, sw_lon, ne_lat, ne_lon = bbox
    # Handle longitude wrap-around is out of scope for v1.
    return sw_lat <= lat <= ne_lat and sw_lon <= lon <= ne_lon


@router.get("/positions", response_model=list[FleetPositionOut])
async def get_positions(
    redis: Redis = Depends(get_redis),
    current_user: dict = Depends(get_current_user),
    status: str | None = Query(None, description="Filter by vehicle status"),
    q: str | None = Query(None, description="Search registration_no or vehicle_code"),
    bbox: str | None = Query(None, description="Bounding box: sw_lat,sw_lon,ne_lat,ne_lon"),
) -> list[FleetPositionOut]:
    _ = current_user

    bbox_tuple: tuple[float, float, float, float] | None = None
    if bbox:
        bbox_tuple = _parse_bbox(bbox)

    raw_items = await redis.hgetall("fleet:latest")
    positions: list[FleetPositionOut] = []

    for _key, value in raw_items.items():
        try:
            data = json.loads(value)
        except json.JSONDecodeError:
            continue

        if status and data.get("status") != status:
            continue

        if q:
            query = q.lower()
            reg = (data.get("registration_no") or "").lower()
            code = (data.get("vehicle_code") or "").lower()
            if query not in reg and query not in code:
                continue

        if bbox_tuple:
            lat = data.get("latitude")
            lon = data.get("longitude")
            if lat is None or lon is None:
                continue
            if not _inside_bbox(float(lat), float(lon), bbox_tuple):
                continue

        try:
            vehicle_type = VehicleType(data.get("vehicle_type"))
        except ValueError:
            vehicle_type = VehicleType.other

        try:
            vehicle_status = VehicleStatus(data.get("status"))
        except ValueError:
            vehicle_status = VehicleStatus.offline

        recorded_at = None
        if data.get("recorded_at"):
            try:
                recorded_at = datetime.fromisoformat(data["recorded_at"])
            except ValueError:
                recorded_at = None

        positions.append(
            FleetPositionOut(
                vehicle_id=data.get("vehicle_id"),
                registration_no=data.get("registration_no") or "",
                vehicle_code=data.get("vehicle_code") or "",
                vehicle_type=vehicle_type,
                latitude=data.get("latitude"),
                longitude=data.get("longitude"),
                speed_kmh=data.get("speed_kmh"),
                heading_deg=data.get("heading_deg"),
                ignition_on=data.get("ignition_on"),
                status=vehicle_status,
                recorded_at=recorded_at,
            )
        )

    return positions
