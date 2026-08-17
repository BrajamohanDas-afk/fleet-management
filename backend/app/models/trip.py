import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum as SQLEnum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.driver import Driver
    from app.models.tracking_session import TrackingSession
    from app.models.vehicle import Vehicle


class TripStatus(str, enum.Enum):
    CREATED = "CREATED"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class Trip(Base):
    __tablename__ = "trips"

    id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(
        ForeignKey("vehicles.id", ondelete="CASCADE"),
        nullable=False,
    )
    driver_id: Mapped[int | None] = mapped_column(
        ForeignKey("drivers.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[TripStatus] = mapped_column(
        SQLEnum(TripStatus, name="tripstatus"),
        default=TripStatus.CREATED,
        nullable=False,
    )
    origin: Mapped[str | None] = mapped_column(Text, nullable=True)
    destination: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    vehicle: Mapped["Vehicle"] = relationship("Vehicle", back_populates="trips")
    driver: Mapped["Driver | None"] = relationship("Driver", back_populates="trips")
    tracking_sessions: Mapped[list["TrackingSession"]] = relationship(
        "TrackingSession",
        back_populates="trip",
        cascade="all, delete-orphan",
    )
