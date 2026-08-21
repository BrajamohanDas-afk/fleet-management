import asyncio
import ipaddress
import json
import socket
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

import httpx
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device

GPS_FEED_REDIS_HASH = "protocol:gps_feeds"
GPS_FEED_REDIS_CHANNEL = "protocol.gps_feeds"
GPS_STATUS_REDIS_CHANNEL = "protocol.device_status"


class GPSFeedValidationError(ValueError):
    pass


@dataclass(frozen=True)
class GPSFeedProbeResult:
    json_reachable: bool
    has_fix: bool
    status: str
    detail: str | None = None
    latitude: float | None = None
    longitude: float | None = None


def validate_gps_feed_url(value: str) -> str:
    url = value.strip()
    if not url:
        raise GPSFeedValidationError("GPS feed URL is required")
    if any(ch.isspace() or ord(ch) < 32 for ch in url):
        raise GPSFeedValidationError("GPS feed URL must not contain spaces")

    try:
        parsed = urlsplit(url)
        _ = parsed.port
    except ValueError as exc:
        raise GPSFeedValidationError("GPS feed URL has an invalid host or port") from exc

    if parsed.scheme.lower() not in {"http", "https"}:
        raise GPSFeedValidationError("GPS feed URL must start with http:// or https://")
    if not parsed.netloc or not parsed.hostname:
        raise GPSFeedValidationError("GPS feed URL must include a host")
    if parsed.username or parsed.password:
        raise GPSFeedValidationError("GPS feed URL must not include credentials")

    return url


def _blocked_ip(ip: ipaddress._BaseAddress) -> bool:
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


async def assert_public_http_url(url: str) -> str:
    url = validate_gps_feed_url(url)
    parsed = urlsplit(url)
    host = parsed.hostname
    if host is None:
        raise GPSFeedValidationError("GPS feed URL must include a host")

    try:
        infos = await asyncio.get_running_loop().getaddrinfo(
            host,
            parsed.port or (443 if parsed.scheme == "https" else 80),
            type=socket.SOCK_STREAM,
        )
    except socket.gaierror as exc:
        raise GPSFeedValidationError("GPS feed host could not be resolved") from exc

    addresses = {info[4][0] for info in infos}
    if not addresses:
        raise GPSFeedValidationError("GPS feed host could not be resolved")
    for address in addresses:
        try:
            ip = ipaddress.ip_address(address)
        except ValueError as exc:
            raise GPSFeedValidationError("GPS feed host resolved to an invalid address") from exc
        if _blocked_ip(ip):
            raise GPSFeedValidationError("GPS feed URL must resolve to a public IP address")

    return url


def _float_value(data: dict, keys: tuple[str, ...]) -> float | None:
    for key in keys:
        if key not in data or data[key] is None:
            continue
        try:
            return float(data[key])
        except (TypeError, ValueError):
            return None
    return None


def _int_value(data: dict, keys: tuple[str, ...]) -> int | None:
    for key in keys:
        if key not in data or data[key] is None:
            continue
        try:
            return int(data[key])
        except (TypeError, ValueError):
            return None
    return None


def _extract_fix(payload: object) -> tuple[bool, float | None, float | None]:
    if not isinstance(payload, dict):
        return False, None, None

    candidates = [payload]
    for key in ("location", "gps", "position", "data"):
        nested = payload.get(key)
        if isinstance(nested, dict):
            candidates.append(nested)

    for candidate in candidates:
        mode = _int_value(candidate, ("mode",)) or _int_value(payload, ("mode",))
        if mode is None or mode < 2:
            continue
        latitude = _float_value(candidate, ("latitude", "lat"))
        longitude = _float_value(candidate, ("longitude", "lng", "lon"))
        if latitude is None or longitude is None:
            continue
        if -90 <= latitude <= 90 and -180 <= longitude <= 180:
            return True, latitude, longitude

    return False, None, None


async def probe_gps_feed(url: str) -> GPSFeedProbeResult:
    try:
        current_url = await assert_public_http_url(url)
    except GPSFeedValidationError as exc:
        return GPSFeedProbeResult(False, False, "error", str(exc))

    timeout = httpx.Timeout(connect=5.0, read=5.0, write=5.0, pool=5.0)
    headers = {"Accept": "application/json", "User-Agent": "fleet-backend-gps-probe"}

    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False, trust_env=False) as client:
            for _ in range(4):
                response = await client.get(current_url, headers=headers)
                if response.is_redirect and response.headers.get("location"):
                    redirected = (
                        str(response.next_request.url)
                        if response.next_request
                        else urljoin(current_url, response.headers["location"])
                    )
                    current_url = await assert_public_http_url(redirected)
                    continue
                break
            else:
                return GPSFeedProbeResult(False, False, "error", "GPS feed redirected too many times")
    except (httpx.HTTPError, GPSFeedValidationError) as exc:
        return GPSFeedProbeResult(False, False, "error", f"GPS feed URL is not reachable: {exc}")

    if response.status_code >= 400:
        return GPSFeedProbeResult(False, False, "error", f"GPS feed returned status {response.status_code}")

    try:
        payload = response.json()
    except (ValueError, json.JSONDecodeError):
        return GPSFeedProbeResult(False, False, "error", "GPS feed did not return JSON")

    has_fix, latitude, longitude = _extract_fix(payload)
    if has_fix:
        return GPSFeedProbeResult(True, True, "fix", latitude=latitude, longitude=longitude)
    return GPSFeedProbeResult(True, False, "waiting_for_fix", "JSON is reachable but no valid latitude/longitude fix was found")


async def sync_gps_feed_config(redis: Redis, device: Device) -> None:
    if device.gps_feed_enabled and device.gps_feed_url:
        payload = {
            "device_id": device.device_serial,
            "vehicle_id": device.vehicle_id,
            "device_serial": device.device_serial,
            "url": device.gps_feed_url,
            "enabled": True,
        }
        encoded = json.dumps(payload)
        await redis.hset(GPS_FEED_REDIS_HASH, device.device_serial, encoded)
        await redis.publish(
            GPS_FEED_REDIS_CHANNEL,
            json.dumps({"action": "upsert", "feed": payload}),
        )
        return
    await redis.hdel(GPS_FEED_REDIS_HASH, device.device_serial)
    await redis.publish(
        GPS_FEED_REDIS_CHANNEL,
        json.dumps({"action": "delete", "device_id": device.device_serial}),
    )


async def sync_all_gps_feed_configs(db: AsyncSession, redis: Redis) -> None:
    result = await db.execute(select(Device).where(Device.gps_feed_url.is_not(None)))
    devices = result.scalars().all()
    active_serials: set[str] = set()
    for device in devices:
        if device.gps_feed_enabled and device.gps_feed_url:
            active_serials.add(device.device_serial)
        await sync_gps_feed_config(redis, device)

    existing = await redis.hgetall(GPS_FEED_REDIS_HASH)
    stale_serials = [serial for serial in existing if serial not in active_serials]
    if stale_serials:
        await redis.hdel(GPS_FEED_REDIS_HASH, *stale_serials)
        for serial in stale_serials:
            await redis.publish(
                GPS_FEED_REDIS_CHANNEL,
                json.dumps({"action": "delete", "device_id": serial}),
            )
