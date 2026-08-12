from app.models.vehicle_latest import VehicleStatus

STALE_SECONDS = 60
OFFLINE_SECONDS = 15 * 60


def derive_status(fix_age_seconds: float | None, speed_kmh: float | None) -> VehicleStatus:
    """Derive vehicle status from fix age and speed.

    Rules (PRD §6):
    - moving: fix < 60s old and speed > 3 km/h
    - standing: fix < 60s old and speed <= 3 km/h
    - stale: fix 60s–15min old
    - offline: fix > 15min old, or never
    """
    if fix_age_seconds is None:
        return VehicleStatus.offline

    if fix_age_seconds < STALE_SECONDS:
        if speed_kmh is not None and speed_kmh > 3:
            return VehicleStatus.moving
        return VehicleStatus.standing

    if fix_age_seconds <= OFFLINE_SECONDS:
        return VehicleStatus.stale

    return VehicleStatus.offline
