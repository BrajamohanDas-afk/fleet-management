import enum
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, func, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Protocol(str, enum.Enum):
    jt808 = "jt808"
    sim = "sim"
    other = "other"


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_id: Mapped[int | None] = mapped_column(
        ForeignKey("vehicles.id"),
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
