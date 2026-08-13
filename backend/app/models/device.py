import enum
from typing import TYPE_CHECKING
from datetime import datetime

if TYPE_CHECKING:
    from app.models.vehicle import Vehicle
    from app.models.device_channel import DeviceChannel

from sqlalchemy import String, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Protocol(str, enum.Enum):
    jt808 = "jt808"
    sim = "sim"
    other = "other"


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_id: Mapped[int | None] = mapped_column(
        ForeignKey("vehicles.id", ondelete="CASCADE"),
        nullable=True,
    )
    device_serial: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    sim_number: Mapped[str] = mapped_column(String(32), nullable=False)
    protocol: Mapped[Protocol] = mapped_column(
        SQLEnum(Protocol, name="protocol"),
        nullable=False,
    )
    last_seen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    vehicle: Mapped["Vehicle | None"] = relationship("Vehicle", back_populates="devices")
    channels: Mapped[list["DeviceChannel"]] = relationship(
        "DeviceChannel",
        back_populates="device",
        cascade="all, delete-orphan",
    )
