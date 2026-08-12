"""H.264 RTSP video publisher for the dev agent.

Reads from the first available webcam via OpenCV; if none is available,
renders a local test pattern (color bars + moving timestamp) so the
simulator always produces a stream.
"""

from __future__ import annotations

import asyncio
import logging
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np

from fault_injection import FaultInjection

logger = logging.getLogger(__name__)

WIDTH = 640
HEIGHT = 480
FPS = 10
BITRATE = "500k"


def _color_bars(width: int, height: int) -> np.ndarray:
    """Render classic SMPTE-ish color bars."""
    bar_width = width // 7
    colors = [
        (255, 255, 255),  # white
        (255, 255, 0),    # yellow
        (0, 255, 255),    # cyan
        (0, 255, 0),      # green
        (255, 0, 255),    # magenta
        (255, 0, 0),      # red
        (0, 0, 255),      # blue
    ]
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    for i, color in enumerate(colors):
        frame[:, i * bar_width : (i + 1) * bar_width] = color
    return frame


class VideoPublisher:
    def __init__(
        self,
        device_id: int,
        channel_no: int,
        stream_path: str,
        rtsp_host: str,
        fault: FaultInjection,
        width: int = WIDTH,
        height: int = HEIGHT,
        fps: int = FPS,
        bitrate: str = BITRATE,
    ) -> None:
        self.device_id = device_id
        self.channel_no = channel_no
        self.stream_path = stream_path
        self.rtsp_url = f"{rtsp_host}/{stream_path}"
        self.fault = fault
        self.width = width
        self.height = height
        self.fps = fps
        self.bitrate = bitrate

        self._task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()
        self._ffmpeg: asyncio.subprocess.Process | None = None
        self._cap: cv2.VideoCapture | None = None
        self._use_webcam = False
        self._frame_count = 0

    async def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._stop_event.clear()
        self._task = asyncio.create_task(self._run())
        logger.info("Started video publisher for device=%s channel=%s -> %s", self.device_id, self.channel_no, self.rtsp_url)

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task and not self._task.done():
            try:
                await asyncio.wait_for(self._task, timeout=5.0)
            except asyncio.TimeoutError:
                self._task.cancel()
                try:
                    await self._task
                except asyncio.CancelledError:
                    pass
        await self._cleanup_ffmpeg()
        if self._cap:
            self._cap.release()
            self._cap = None

    async def restart(self) -> None:
        logger.info("Restarting video publisher device=%s channel=%s", self.device_id, self.channel_no)
        await self.stop()
        await asyncio.sleep(0.5)
        await self.start()

    async def _run(self) -> None:
        try:
            if not shutil.which("ffmpeg"):
                logger.error("ffmpeg not found; cannot publish video for device=%s channel=%s", self.device_id, self.channel_no)
                return
            await self._detect_camera()
            await self._start_ffmpeg()
            await self._publish_loop()
        except Exception:
            logger.exception("Video publisher crashed for device=%s channel=%s", self.device_id, self.channel_no)
        finally:
            await self._cleanup_ffmpeg()

    async def _detect_camera(self) -> None:
        # Camera detection blocks briefly; run in a thread.
        def _try_open() -> cv2.VideoCapture | None:
            for index in range(2):
                cap = cv2.VideoCapture(index)
                if cap.isOpened():
                    ret, _ = cap.read()
                    if ret:
                        return cap
                    cap.release()
            return None

        cap = await asyncio.to_thread(_try_open)
        if cap is not None:
            self._cap = cap
            self._use_webcam = True
            logger.info("Using webcam for device=%s channel=%s", self.device_id, self.channel_no)
        else:
            self._use_webcam = False
            logger.info("No webcam available; using test pattern for device=%s channel=%s", self.device_id, self.channel_no)

    def _generate_frame(self) -> np.ndarray:
        if self._use_webcam and self._cap:
            ret, frame = self._cap.read()
            if ret and frame is not None:
                if frame.shape[1] != self.width or frame.shape[0] != self.height:
                    frame = cv2.resize(frame, (self.width, self.height))
                return frame
            # Fall through to test pattern on read failure.

        base = _color_bars(self.width, self.height)
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        label = f"SIM D{self.device_id} CH{self.channel_no} {timestamp}"
        cv2.putText(base, label, (20, self.height // 2), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)
        cv2.putText(base, label, (20, self.height // 2), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 1)
        # Add a moving rectangle to make the stream visually active.
        offset = int((time.time() * 30) % (self.width - 40))
        cv2.rectangle(base, (offset, 20), (offset + 40, 60), (0, 0, 0), -1)
        return base

    async def _start_ffmpeg(self) -> None:
        cmd = [
            "ffmpeg",
            "-y",
            "-f", "rawvideo",
            "-pix_fmt", "bgr24",
            "-s", f"{self.width}x{self.height}",
            "-r", str(self.fps),
            "-thread_queue_size", "512",
            "-i", "-",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-tune", "zerolatency",
            "-b:v", self.bitrate,
            "-maxrate", self.bitrate,
            "-bufsize", "1M",
            "-g", str(self.fps * 3),
            "-pix_fmt", "yuv420p",
            "-f", "rtsp",
            self.rtsp_url,
        ]
        logger.debug("ffmpeg command: %s", " ".join(cmd))
        self._ffmpeg = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    async def _publish_loop(self) -> None:
        if self._ffmpeg is None or self._ffmpeg.stdin is None:
            return

        frame_time = 1.0 / self.fps
        last_disconnect_check = time.monotonic()

        while not self._stop_event.is_set():
            if self.fault.should_disconnect_video():
                logger.info("Fault injection: disconnecting video device=%s channel=%s", self.device_id, self.channel_no)
                await self._cleanup_ffmpeg()
                await asyncio.sleep(1.0)
                await self._start_ffmpeg()
                if self._ffmpeg is None or self._ffmpeg.stdin is None:
                    return
                last_disconnect_check = time.monotonic()

            if self.fault.should_drop_frame():
                # Skip one frame.
                await asyncio.sleep(frame_time)
                continue

            frame = await asyncio.to_thread(self._generate_frame)
            frame_bytes = frame.tobytes()
            try:
                self._ffmpeg.stdin.write(frame_bytes)
                await self._ffmpeg.stdin.drain()
            except (BrokenPipeError, ConnectionResetError):
                logger.warning("ffmpeg pipe closed for device=%s channel=%s; restarting", self.device_id, self.channel_no)
                await self._cleanup_ffmpeg()
                await asyncio.sleep(0.5)
                await self._start_ffmpeg()
                if self._ffmpeg is None or self._ffmpeg.stdin is None:
                    return
                continue

            self._frame_count += 1
            await asyncio.sleep(frame_time)

            # Periodic disconnect check every ~3 seconds.
            if time.monotonic() - last_disconnect_check >= 3.0:
                _ = self.fault.should_disconnect_video()
                last_disconnect_check = time.monotonic()

    async def _cleanup_ffmpeg(self) -> None:
        if self._ffmpeg is None:
            return
        try:
            if self._ffmpeg.stdin:
                self._ffmpeg.stdin.close()
        except Exception:
            pass
        try:
            self._ffmpeg.terminate()
            await asyncio.wait_for(self._ffmpeg.wait(), timeout=3.0)
        except (ProcessLookupError, asyncio.TimeoutError):
            try:
                self._ffmpeg.kill()
                await self._ffmpeg.wait()
            except Exception:
                pass
        except Exception:
            pass
        self._ffmpeg = None
