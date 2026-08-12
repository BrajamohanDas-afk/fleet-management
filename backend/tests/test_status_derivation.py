import pytest

from app.services.status_service import (
    OFFLINE_SECONDS,
    STALE_SECONDS,
    VehicleStatus,
    derive_status,
)


@pytest.mark.parametrize(
    "fix_age_seconds, speed_kmh, expected",
    [
        # Moving
        (0, 10, VehicleStatus.moving),
        (30, 15, VehicleStatus.moving),
        (59, 4, VehicleStatus.moving),
        # Standing
        (0, 0, VehicleStatus.standing),
        (0, 3, VehicleStatus.standing),
        (30, 2, VehicleStatus.standing),
        (59, 0, VehicleStatus.standing),
        (30, None, VehicleStatus.standing),
        # Stale boundaries
        (STALE_SECONDS, 0, VehicleStatus.stale),
        (STALE_SECONDS + 1, 0, VehicleStatus.stale),
        (OFFLINE_SECONDS, 0, VehicleStatus.stale),
        (OFFLINE_SECONDS - 1, 0, VehicleStatus.stale),
        # Offline
        (OFFLINE_SECONDS + 1, 0, VehicleStatus.offline),
        (3600, 0, VehicleStatus.offline),
        (None, 0, VehicleStatus.offline),
        (None, None, VehicleStatus.offline),
    ],
)
def test_status_derivation(fix_age_seconds, speed_kmh, expected):
    assert derive_status(fix_age_seconds, speed_kmh) == expected
