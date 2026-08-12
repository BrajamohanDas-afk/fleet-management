"""Supervisor that runs one async agent per configured device."""

from __future__ import annotations

import argparse
import asyncio
import logging
import signal
import sys
from pathlib import Path
from typing import Any

import aiohttp
import yaml

from agent import Agent
from fault_injection import FaultInjection, build_arg_parser

logger = logging.getLogger(__name__)


def load_config(path: str) -> dict[str, Any]:
    with Path(path).open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


MAX_VIDEO_DEVICES = 5


def _prepare_device_configs(config: dict[str, Any]) -> list[dict[str, Any]]:
    """Return device configs with video capped at MAX_VIDEO_DEVICES."""
    devices = list(config.get("devices", []))
    video_count = 0
    for device in devices:
        if device.get("video_enabled"):
            if video_count >= MAX_VIDEO_DEVICES:
                logger.warning(
                    "Device %s video disabled: max %s live video devices allowed",
                    device.get("device_id"),
                    MAX_VIDEO_DEVICES,
                )
                device["video_enabled"] = False
            else:
                video_count += 1
    return devices


async def run_agent(
    device_config: dict[str, Any],
    config: dict[str, Any],
    fault: FaultInjection,
    session: aiohttp.ClientSession,
) -> None:
    """Run a single agent, recreating and restarting it on failure."""
    while True:
        agent: Agent | None = None
        try:
            agent = Agent(config, device_config, fault.copy(), session)
            await agent.run()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception(
                "Agent device=%s crashed; restarting in 5s",
                device_config.get("device_id"),
            )
            await asyncio.sleep(5.0)
        finally:
            if agent is not None:
                await agent.stop()


async def main() -> None:
    parser = build_arg_parser(argparse.ArgumentParser(description="Fleet dev agent supervisor"))
    args = parser.parse_args()

    config = load_config(args.config)
    base_fault = FaultInjection.from_config(config.get("fault_injection", {}))
    base_fault.apply_cli_args(args)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stdout,
    )

    device_configs = _prepare_device_configs(config)

    session = aiohttp.ClientSession()
    tasks = []
    for device_config in device_configs:
        fault = base_fault.copy()
        fault.apply_config(device_config.get("fault_injection", {}))
        tasks.append(
            asyncio.create_task(run_agent(device_config, config, fault, session))
        )

    shutdown_event = asyncio.Event()

    def _on_signal() -> None:
        logger.info("Received shutdown signal; shutting down gracefully")
        shutdown_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _on_signal)

    try:
        await shutdown_event.wait()
    finally:
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        await session.close()
        logger.info("Supervisor shutdown complete")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
