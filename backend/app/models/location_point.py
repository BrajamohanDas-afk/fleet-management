import enum
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum as SQLEnum,
    Float,
    ForeignKey,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class LocationQuality(str, enum.Enum):
    GOOD = "GOOD"
    USABLE = "USABLE"
    QUESTIONABLE = "QUESTIONABLE"
    LOW_QUALITY = "LOW_QUALITY"
    SUSPICIOUS = "SUSPICIOUS"


class LocationPoint(Base):
    __tablename__ = "location_points"
    __table_args__ = (
        UniqueConstraint("session_id", "sequence", name="uq_location_points_session_sequence"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("tracking_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    sequence: Mapped[int] = mapped_column(BigInteger, nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    accuracy: Mapped[float | None] = mapped_column(Float, nullable=True)
    speed_device: Mapped[float | None] = mapped_column(Float, nullable=True)
    speed_calculated: Mapped[float | None] = mapped_column(Float, nullable=True)
    heading: Mapped[float | None] = mapped_column(Float, nullable=True)
    altitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    quality: Mapped[LocationQuality] = mapped_column(
        SQLEnum(LocationQuality, name="locationquality"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    session: Mapped["TrackingSession"] = relationship(
        "TrackingSession",
        back_populates="location_points",
    )
