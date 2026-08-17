import enum

from app.models.audit_log import AuditLog
from app.models.driver import Driver
from app.models.location_point import LocationPoint, LocationQuality
from app.models.tracking_session import TrackingSession, TrackingSessionStatus
from app.models.trip import Trip, TripStatus


class AuditEventType(str, enum.Enum):
    TRIP_STARTED = "TRIP_STARTED"
    TRIP_COMPLETED = "TRIP_COMPLETED"
    TRACKING_SESSION_CREATED = "TRACKING_SESSION_CREATED"
    TRACKING_SESSION_REVOKED = "TRACKING_SESSION_REVOKED"
    TRACKING_SESSION_EXTENDED = "TRACKING_SESSION_EXTENDED"
    TRACKING_STARTED = "TRACKING_STARTED"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    LOCATION_REJECTED = "LOCATION_REJECTED"
