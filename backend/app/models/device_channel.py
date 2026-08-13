from typing import TYPE_CHECKING
from sqlalchemy import ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.models.device import Device


from app.core.database import Base


class DeviceChannel(Base):
    __tablename__ = "device_channels"
    __table_args__ = (UniqueConstraint("device_id", "channel_no"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    channel_no: Mapped[int] = mapped_column(nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    # The source is kept server-side.  Browsers only receive the MediaMTX
    # WHEP URL generated from stream_path.
    rtsp_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    stream_path: Mapped[str | None] = mapped_column(Text, nullable=True)

    device: Mapped["Device"] = relationship("Device", back_populates="channels")
