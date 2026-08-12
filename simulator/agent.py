"""Per-device dev agent: emits GPS telemetry and publishes optional video streams."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

import aiohttp

from fault_injection import FaultInjection
from gps_routes import RoutePoint, get_route
from video_publisher import VideoPublisher

logger = logging.getLogger(__name__)


class Agent:
    def __init__(
        self,
        config: dict[str, Any],
        device_config: dict[str, Any],
        fault: FaultInjection,
        session: aiohttp.ClientSession,
    ) -> None:
        self.config = config
        self.device_config = device_config
        self.fault = fault
        self.session = session

        self.device_id = int(device_config["device_id"])
        self.device_serial = device_config["device_serial"]
        self.route_name = device_config["route"]
        self.video_enabled = bool(device_config.get("video_enabled", False))
        self.channels = device_config.get("channels", [])
        self.base_interval = float(config.get("telemetry_interval_seconds", 5.0))

        self._stop_event = asyncio.Event()
        self._tasks: list[asyncio.Task] = []
        self._video_publishers: list[VideoPublisher] = []
        self._token: str | None = None
        self._route = get_route(self.route_name)

    async def run(self) -> None:
        """Main agent loop. Runs until stop() is called."""
        await self._login()
        self._tasks = []

        # Start video publishers first so streams are ready when telemetry begins.
        if self.video_enabled and self.channels:
            rtsp_host = self.config.get("mediamtx_rtsp_host", "rtsp://mediamtx:8554")
            for channel in self.channels:
                # Each publisher gets its own fault copy so disconnect/drop timers
                # are independent across channels and devices.
                publisher = VideoPublisher(
                    device_id=self.device_id,
                    channel_no=int(channel["channel_no"]),
                    stream_path=channel["stream_path"],
                    rtsp_host=rtsp_host,
                    fault=self.fault.copy(),
                )
                self._video_publishers.append(publisher)
                await publisher.start()

        gps_task = asyncio.create_task(self._gps_emitter())
        self._tasks.append(gps_task)

        await self._stop_event.wait()

        for task in self._tasks:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        for publisher in self._video_publishers:
            await publisher.stop()
        self._video_publishers.clear()

    async def stop(self) -> None:
        self._stop_event.set()

    async def _login(self) -> None:
        auth = self.config.get("auth", {})
        username = auth.get("username", "admin")
        password = auth.get("password", "admin")
        url = f"{self.config['api_base_url']}/auth/login"
        payload = {"username": username, "password": password}
        async with self.session.post(url, json=payload) as resp:
            resp.raise_for_status()
            data = await resp.json()
            self._token = data["access_token"]
            logger.info("Agent device=%s logged in", self.device_id)

    async def _gps_emitter(self) -> None:
        url = f"{self.config['api_base_url']}/dev/ingest/telemetry"
        headers = {
            "X-Device-Key": self.config["dev_device_key"],
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
        }

        while not self._stop_event.is_set():
            try:
                interval = self.fault.interval_with_jitter(self.base_interval)
                await asyncio.wait_for(self._stop_event.wait(), timeout=interval)
                break
            except asyncio.TimeoutError:
                pass

            if self.fault.should_trigger_stall():
                self.fault.begin_stall()
                logger.info("Fault injection: stalling telemetry for device=%s %ss", self.device_id, self.fault.stall_seconds)
                continue

            if self.fault.is_stalled():
                continue

            point: RoutePoint = next(self._route)
            payload = {
                "device_id": self.device_id,
                "latitude": point.latitude,
                "longitude": point.longitude,
                "speed_kmh": point.speed_kmh,
                "heading_deg": point.heading_deg,
                "ignition_on": point.ignition_on,
                "recorded_at": datetime.now(timezone.utc).isoformat(),
            }

            try:
                async with self.session.post(url, headers=headers, json=payload) as resp:
                    if resp.status == 401:
                        logger.warning("Token expired for device=%s; re-logging in", self.device_id)
                        await self._login()
                        headers["Authorization"] = f"Bearer {self._token}"
                        continue
                    if resp.status >= 400:
                        text = await resp.text()
                        logger.warning("Telemetry rejected for device=%s: %s %s", self.device_id, resp.status, text)
                    else:
                        logger.debug("Telemetry sent for device=%s: %s", self.device_id, payload)
            except aiohttp.ClientError as exc:
                # Transient network errors are expected during API restarts;
                # log at warning without a full traceback.
                logger.warning(
                    "Telemetry send failed for device=%s (transient): %s",
                    self.device_id,
                    exc,
                )
            except Exception:
                logger.exception("Failed to send telemetry for device=%s", self.device_id)
