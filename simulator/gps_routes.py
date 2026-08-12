"""Deterministic GPS routes around Hyderabad, India for the dev simulator."""

from __future__ import annotations

import math
import random
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Callable


@dataclass
class RoutePoint:
    latitude: float
    longitude: float
    speed_kmh: float
    heading_deg: float
    ignition_on: bool


def _interpolate(
    start: tuple[float, float],
    end: tuple[float, float],
    segments: int,
    base_speed: float,
) -> list[tuple[float, float, float]]:
    """Return list of (lat, lon, speed) between two waypoints."""
    dlat = (end[0] - start[0]) / segments
    dlon = (end[1] - start[1]) / segments
    points: list[tuple[float, float, float]] = []
    for i in range(segments):
        # Add small speed noise so the trace looks realistic.
        speed = max(0.0, base_speed + random.uniform(-5, 5))
        points.append((start[0] + dlat * i, start[1] + dlon * i, speed))
    return points


def _heading(from_pt: tuple[float, float], to_pt: tuple[float, float]) -> float:
    """Return bearing in degrees from from_pt to to_pt."""
    lat1, lon1 = math.radians(from_pt[0]), math.radians(from_pt[1])
    lat2, lon2 = math.radians(to_pt[0]), math.radians(to_pt[1])
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    bearing = math.degrees(math.atan2(x, y))
    return (bearing + 360.0) % 360.0


def _build_route(
    waypoints: list[tuple[float, float]],
    base_speed: float = 35.0,
    segments_per_leg: int = 6,
) -> list[RoutePoint]:
    """Build a looping route from waypoints."""
    if not waypoints:
        return []

    raw_points: list[tuple[float, float, float]] = []
    closed = waypoints + [waypoints[0]]
    for i in range(len(closed) - 1):
        raw_points.extend(_interpolate(closed[i], closed[i + 1], segments_per_leg, base_speed))

    route: list[RoutePoint] = []
    for i, (lat, lon, speed) in enumerate(raw_points):
        next_pt = raw_points[(i + 1) % len(raw_points)]
        heading = _heading((lat, lon), (next_pt[0], next_pt[1]))
        # Vehicle is idling/parked when speed is near zero.
        ignition = speed > 0.5
        route.append(
            RoutePoint(
                latitude=round(lat, 6),
                longitude=round(lon, 6),
                speed_kmh=round(speed, 1) if ignition else 0.0,
                heading_deg=round(heading, 1),
                ignition_on=ignition,
            )
        )
    return route


# Five routes around Hyderabad. Coordinates are approximate city blocks.
ROUTES: dict[str, Callable[[], Iterator[RoutePoint]]] = {
    "hitech_city_loop": lambda: iter(
        _build_route(
            [
                (17.4502, 78.3888),
                (17.4525, 78.3925),
                (17.4490, 78.3950),
                (17.4460, 78.3920),
                (17.4475, 78.3865),
            ],
            base_speed=40.0,
        )
    ),
    "gachibowli_loop": lambda: iter(
        _build_route(
            [
                (17.4401, 78.3489),
                (17.4430, 78.3550),
                (17.4385, 78.3585),
                (17.4355, 78.3535),
                (17.4370, 78.3460),
            ],
            base_speed=45.0,
        )
    ),
    "secunderabad_loop": lambda: iter(
        _build_route(
            [
                (17.4399, 78.4983),
                (17.4435, 78.5050),
                (17.4380, 78.5100),
                (17.4340, 78.5030),
                (17.4365, 78.4950),
            ],
            base_speed=30.0,
        )
    ),
    "kukatpally_loop": lambda: iter(
        _build_route(
            [
                (17.4948, 78.3996),
                (17.4980, 78.4060),
                (17.4920, 78.4100),
                (17.4885, 78.4035),
                (17.4910, 78.3950),
            ],
            base_speed=35.0,
        )
    ),
    "lb_nagar_loop": lambda: iter(
        _build_route(
            [
                (17.3457, 78.5522),
                (17.3490, 78.5580),
                (17.3435, 78.5620),
                (17.3400, 78.5560),
                (17.3425, 78.5480),
            ],
            base_speed=25.0,
        )
    ),
}


def get_route(name: str) -> Iterator[RoutePoint]:
    """Return an infinite looping iterator for the named route."""
    if name not in ROUTES:
        raise KeyError(f"Unknown route: {name}. Available: {list(ROUTES.keys())}")
    route = list(ROUTES[name]())
    if not route:
        raise ValueError(f"Route {name} is empty")
    idx = 0
    while True:
        yield route[idx % len(route)]
        idx += 1
