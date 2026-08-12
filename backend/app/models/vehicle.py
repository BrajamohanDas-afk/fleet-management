import enum
from datetime import date, datetime

from sqlalchemy import String, Float, Date, DateTime, func, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class VehicleType(str, enum.Enum):
    bike = "bike"
    car = "car"
    truck = "truck"
    bus = "bus"
    other = "other"


class LicenseStatus(str, enum.Enum):
    valid = "valid"
    expired = "expired"
    pending = "pending"
    suspended = "suspended"


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(primary_key=True)
    registration_no: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    vehicle_code: Mapped[str] = mapped_column(String(32), nullable=False)
    vehicle_type: Mapped[VehicleType] = mapped_column(
        SQLEnum(VehicleType, name="vehicletype"),
        nullable=False,
    )
    speed_limit_kmh: Mapped[float | None] = mapped_column(Float, nullable=True)
    license_status: Mapped[LicenseStatus] = mapped_column(
        SQLEnum(LicenseStatus, name="licensestatus"),
        nullable=False,
    )
    license_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    latest: Mapped["VehicleLatest"] = relationship(
        "VehicleLatest",
        back_populates="vehicle",
        uselist=False,
        cascade="all, delete-orphan",
    )
