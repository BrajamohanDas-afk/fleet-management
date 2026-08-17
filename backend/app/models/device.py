import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum as SQLEnum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.device_channel import DeviceChannel
    from app.models.vehicle import Vehicle


class Protocol(str, enum.Enum):
    jt808 = "jt808"
    sim = "sim"
    other = "other"


class DeviceSource(str, enum.Enum):
    simulator = "simulator"
    browser = "browser"
    jt808 = "jt808"


class ConnectionStatus(str, enum.Enum):
    waiting = "waiting"
    connected = "connected"
    stale = "stale"
    auth_error = "authentication_error"
    unknown_device = "unknown_device"
    unavailable = "unavailable"


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
    source: Mapped[DeviceSource] = mapped_column(
        SQLEnum(DeviceSource, name="devicesource"),
        default=DeviceSource.simulator,
        nullable=False,
    )
    external_device_id: Mapped[int | None] = mapped_column(nullable=True)
    external_device_identifier: Mapped[str | None] = mapped_column(String(128), nullable=True)
    connection_status: Mapped[ConnectionStatus] = mapped_column(
        SQLEnum(ConnectionStatus, name="connectionstatus"),
        default=ConnectionStatus.waiting,
        nullable=False,
    )
    last_external_sync_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    vehicle: Mapped["Vehicle | None"] = relationship("Vehicle", back_populates="devices")
    channels: Mapped[list["DeviceChannel"]] = relationship(
        "DeviceChannel",
        back_populates="device",
        cascade="all, delete-orphan",
    )
