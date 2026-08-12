from sqlalchemy import ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DeviceChannel(Base):
    __tablename__ = "device_channels"
    __table_args__ = (UniqueConstraint("device_id", "channel_no"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), nullable=False)
    channel_no: Mapped[int] = mapped_column(nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    stream_path: Mapped[str | None] = mapped_column(Text, nullable=True)
