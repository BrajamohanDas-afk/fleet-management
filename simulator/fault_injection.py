"""Fault injection helpers for the dev agent.

Faults can be set via config.yaml or CLI flags:
  --drop-frames            randomly drop video frames
  --stall 20s              pause telemetry emission for N seconds
  --jitter                 randomly vary GPS interval
  --disconnect-every 60s   disconnect and reconnect video every N seconds
"""

from __future__ import annotations

import argparse
import dataclasses
import random
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass
class FaultInjection:
    drop_frames: bool = False
    stall_seconds: float = 0.0
    jitter: bool = False
    disconnect_every_seconds: float = 0.0

    # Internal mutable state (excluded from repr for clarity).
    _stall_until: datetime | None = field(default=None, repr=False)
    _stall_triggered: bool = field(default=False, repr=False)
    _last_disconnect: datetime | None = field(default=None, repr=False)

    @classmethod
    def from_config(cls, config: dict[str, Any]) -> "FaultInjection":
        return cls(
            drop_frames=bool(config.get("drop_frames", False)),
            stall_seconds=float(config.get("stall_seconds", 0.0)),
            jitter=bool(config.get("jitter", False)),
            disconnect_every_seconds=float(config.get("disconnect_every_seconds", 0.0)),
        )

    def apply_config(self, config: dict[str, Any]) -> "FaultInjection":
        """Overlay a config dict (e.g. per-device overrides) onto this instance."""
        if "drop_frames" in config:
            self.drop_frames = bool(config["drop_frames"])
        if "stall_seconds" in config:
            self.stall_seconds = float(config["stall_seconds"])
        if "jitter" in config:
            self.jitter = bool(config["jitter"])
        if "disconnect_every_seconds" in config:
            self.disconnect_every_seconds = float(config["disconnect_every_seconds"])
        return self

    def apply_cli_args(self, args: argparse.Namespace) -> "FaultInjection":
        if args.drop_frames:
            self.drop_frames = True
        if args.stall_seconds:
            self.stall_seconds = float(args.stall_seconds)
        if args.jitter:
            self.jitter = True
        if args.disconnect_every_seconds:
            self.disconnect_every_seconds = float(args.disconnect_every_seconds)
        return self

    def copy(self) -> "FaultInjection":
        """Return a fresh instance with the same settings but reset mutable state.

        Use this when multiple publishers/agents need independent fault timers.
        """
        return dataclasses.replace(
            self,
            _stall_until=None,
            _stall_triggered=False,
            _last_disconnect=None,
        )

    def should_drop_frame(self) -> bool:
        if not self.drop_frames:
            return False
        # Drop ~5% of frames when enabled.
        return random.random() < 0.05

    def interval_with_jitter(self, base_interval: float) -> float:
        if not self.jitter:
            return base_interval
        # Vary interval by +/- 40%, clamped to a sane range.
        return max(1.0, base_interval * random.uniform(0.6, 1.4))

    def should_trigger_stall(self) -> bool:
        if self.stall_seconds <= 0:
            return False
        if self._stall_triggered:
            return False
        if self._stall_until is not None:
            return False
        return True

    def is_stalled(self) -> bool:
        if self._stall_until is None:
            return False
        now = datetime.now(timezone.utc)
        if now >= self._stall_until:
            self._stall_until = None
            return False
        return True

    def begin_stall(self) -> None:
        if self.stall_seconds > 0:
            self._stall_triggered = True
            now = datetime.now(timezone.utc)
            self._stall_until = datetime.fromtimestamp(
                now.timestamp() + self.stall_seconds, tz=timezone.utc
            )

    def should_disconnect_video(self) -> bool:
        if self.disconnect_every_seconds <= 0:
            return False
        now = datetime.now(timezone.utc)
        if self._last_disconnect is None:
            self._last_disconnect = now
            return False
        elapsed = (now - self._last_disconnect).total_seconds()
        if elapsed >= self.disconnect_every_seconds:
            self._last_disconnect = now
            return True
        return False

    def reset_disconnect_timer(self) -> None:
        self._last_disconnect = datetime.now(timezone.utc)


def build_arg_parser(base: argparse.ArgumentParser) -> argparse.ArgumentParser:
    base.add_argument("--config", default="config.yaml", help="Path to YAML config file")
    base.add_argument("--drop-frames", action="store_true", help="Randomly drop video frames")
    base.add_argument("--stall", dest="stall_seconds", type=float, default=0, help="Pause telemetry N seconds")
    base.add_argument("--jitter", action="store_true", help="Randomly vary GPS interval")
    base.add_argument("--disconnect-every", dest="disconnect_every_seconds", type=float, default=0, help="Reconnect video every N seconds")
    return base
