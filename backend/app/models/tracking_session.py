import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum as SQLEnum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.location_point import LocationPoint
    from app.models.trip import Trip
    from app.models.vehicle import Vehicle


class TrackingSessionStatus(str, enum.Enum):
    CREATED = "CREATED"
    WAITING_FOR_DRIVER = "WAITING_FOR_DRIVER"
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    OFFLINE = "OFFLINE"
    COMPLETED = "COMPLETED"
    EXPIRED = "EXPIRED"
    REVOKED = "REVOKED"
    PERMISSION_DENIED = "PERMISSION_DENIED"


class TrackingSession(Base):
    __tablename__ = "tracking_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    trip_id: Mapped[int | None] = mapped_column(
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=True,
    )
    vehicle_id: Mapped[int | None] = mapped_column(
        ForeignKey("vehicles.id", ondelete="CASCADE"),
        nullable=True,
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    installation_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[TrackingSessionStatus] = mapped_column(
        SQLEnum(TrackingSessionStatus, name="trackingsessionstatus"),
        default=TrackingSessionStatus.WAITING_FOR_DRIVER,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    trip: Mapped["Trip | None"] = relationship("Trip", back_populates="tracking_sessions")
    vehicle: Mapped["Vehicle | None"] = relationship("Vehicle")
    location_points: Mapped[list["LocationPoint"]] = relationship(
        "LocationPoint",
        back_populates="session",
        cascade="all, delete-orphan",
    )
