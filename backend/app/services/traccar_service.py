"""Small Traccar HTTP client and importer adapter.

Traccar remains the source of GPS fixes; the fleet telemetry service remains
the only path that persists and publishes normalized positions.
"""

from datetime import datetime, timezone
import logging
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.device import ConnectionStatus, Device, DeviceSource
from app.repositories import device_repository
from app.services.telemetry_service import ingest_telemetry

logger = logging.getLogger(__name__)


class TraccarError(RuntimeError):
    pass


class TraccarAuthError(TraccarError):
    pass


def _as_datetime(value: Any) -> datetime | None:
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def normalize_position(position: dict[str, Any]) -> dict[str, Any] | None:
    """Map a Traccar position into the fleet telemetry contract."""
    latitude = position.get("latitude")
    longitude = position.get("longitude")
    recorded_at = _as_datetime(position.get("deviceTime") or position.get("fixTime") or position.get("serverTime"))
    if latitude is None or longitude is None or recorded_at is None:
        return None
    attributes = position.get("attributes") or {}
    speed_knots = position.get("speed")
    ignition = attributes.get("ignition")
    if isinstance(ignition, str):
        ignition = ignition.strip().lower() in {"1", "true", "on", "yes"}
    return {
        "external_device_id": position.get("deviceId"),
        "external_device_identifier": position.get("deviceIdentifier"),
        "recorded_at": recorded_at,
        "latitude": float(latitude),
        "longitude": float(longitude),
        "speed_kmh": float(speed_knots) * 1.852 if speed_knots is not None else None,
        "heading_deg": float(position["course"]) if position.get("course") is not None else None,
        "ignition_on": ignition if ignition is None or isinstance(ignition, bool) else bool(ignition),
    }


class TraccarClient:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self.client = client or httpx.AsyncClient(base_url=settings.TRACCAR_URL.rstrip("/"), timeout=10.0)
        self._owns_client = client is None
        self._authenticated = False

    async def close(self) -> None:
        if self._owns_client:
            await self.client.aclose()

    async def authenticate(self) -> None:
        try:
            response = await self.client.post(
                "/api/session",
                data={"email": settings.TRACCAR_USERNAME, "password": settings.TRACCAR_PASSWORD},
            )
        except httpx.HTTPError as exc:
            raise TraccarError(str(exc)) from exc
        if response.status_code in (401, 403):
            raise TraccarAuthError("Traccar authentication failed")
        response.raise_for_status()
        self._authenticated = True

    async def _get(self, path: str) -> list[dict[str, Any]]:
        if not self._authenticated:
            await self.authenticate()
        try:
            response = await self.client.get(path)
        except httpx.HTTPError as exc:
            raise TraccarError(str(exc)) from exc
        if response.status_code in (401, 403):
            self._authenticated = False
            raise TraccarAuthError("Traccar authentication failed")
        response.raise_for_status()
        data = response.json()
        return data if isinstance(data, list) else []

    async def devices(self) -> list[dict[str, Any]]:
        return await self._get("/api/devices")

    async def positions(self) -> list[dict[str, Any]]:
        return await self._get("/api/positions")


async def _set_traccar_status(db: AsyncSession, status: ConnectionStatus) -> None:
    result = await db.execute(select(Device).where(Device.source == DeviceSource.traccar))
    for device in result.scalars().all():
        device.connection_status = status


async def sync_traccar_once(db: AsyncSession, redis, client: TraccarClient | None = None) -> int:
    """Import all current Traccar positions and return accepted point count."""
    owns_client = client is None
    traccar = client or TraccarClient()
    try:
        traccar_devices = await traccar.devices()
        device_map: dict[tuple[str, Any], dict[str, Any]] = {}
        for item in traccar_devices:
            if item.get("id") is not None:
                device_map[("id", item["id"])] = item
            if item.get("uniqueId"):
                device_map[("identifier", item["uniqueId"])] = item

        positions = await traccar.positions()
        accepted = 0
        now = datetime.now(timezone.utc)
        for raw in positions:
            normalized = normalize_position(raw)
            if normalized is None:
                continue
            traccar_device = device_map.get(("id", normalized["external_device_id"]))
            identifier = normalized.get("external_device_identifier") or (traccar_device or {}).get("uniqueId")
            device = await device_repository.get_by_external_id(db, normalized["external_device_id"])
            if device is None and identifier:
                device = await device_repository.get_by_external_identifier(db, identifier)
            if device is None or device.source != DeviceSource.traccar or device.vehicle_id is None:
                logger.warning("Rejected unknown Traccar device id=%s identifier=%s", normalized["external_device_id"], identifier)
                continue
            device.external_device_id = normalized["external_device_id"]
            if identifier:
                device.external_device_identifier = identifier
            device.last_external_sync_at = now
            device.connection_status = ConnectionStatus.connected
            point = await ingest_telemetry(
                db, redis, device.id, normalized["recorded_at"], normalized["latitude"], normalized["longitude"],
                normalized["speed_kmh"], normalized["heading_deg"], normalized["ignition_on"],
            )
            if point is not None:
                accepted += 1
        await db.commit()
        return accepted
    except TraccarAuthError:
        await _set_traccar_status(db, ConnectionStatus.auth_error)
        await db.commit()
        raise
    except (TraccarError, httpx.HTTPError):
        await _set_traccar_status(db, ConnectionStatus.unavailable)
        await db.commit()
        raise
    finally:
        if owns_client:
            await traccar.close()


async def mark_stale_traccar_devices(db: AsyncSession) -> None:
    cutoff = datetime.now(timezone.utc).timestamp() - settings.TRACCAR_STALE_SECONDS
    result = await db.execute(select(Device).where(Device.source == DeviceSource.traccar))
    for device in result.scalars().all():
        if device.last_external_sync_at is None or device.last_external_sync_at.timestamp() < cutoff:
            if device.connection_status == ConnectionStatus.connected:
                device.connection_status = ConnectionStatus.stale
    await db.commit()
