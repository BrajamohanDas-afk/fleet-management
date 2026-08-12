"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-08-12 00:00:00.000000

"""
from datetime import date, timedelta
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _month_bounds(today: date, offset: int) -> tuple[str, str, str]:
    """Return (partition_name, start_ts, end_ts) for the month offset from today."""
    start = (today.replace(day=1) + timedelta(days=offset * 31)).replace(day=1)
    end = (start + timedelta(days=31)).replace(day=1)
    name = f"telemetry_points_y{start.year}m{start.month:02d}"
    start_ts = start.strftime("%Y-%m-%d 00:00:00+00")
    end_ts = end.strftime("%Y-%m-%d 00:00:00+00")
    return name, start_ts, end_ts


def upgrade() -> None:
    op.create_table(
        "vehicles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("registration_no", sa.String(length=32), nullable=False),
        sa.Column("vehicle_code", sa.String(length=32), nullable=False),
        sa.Column(
            "vehicle_type",
            sa.Enum("bike", "car", "truck", "bus", "other", name="vehicletype"),
            nullable=False,
        ),
        sa.Column("speed_limit_kmh", sa.Float(), nullable=True),
        sa.Column(
            "license_status",
            sa.Enum("valid", "expired", "pending", "suspended", name="licensestatus"),
            nullable=False,
        ),
        sa.Column("license_expiry", sa.Date(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("registration_no"),
    )

    op.create_table(
        "devices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("vehicle_id", sa.Integer(), nullable=True),
        sa.Column("device_serial", sa.String(length=64), nullable=False),
        sa.Column("sim_number", sa.String(length=32), nullable=False),
        sa.Column(
            "protocol",
            sa.Enum("jt808", "sim", "other", name="protocol"),
            nullable=False,
        ),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("device_serial"),
    )

    op.create_table(
        "device_channels",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.Integer(), nullable=False),
        sa.Column("channel_no", sa.Integer(), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("stream_path", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("device_id", "channel_no"),
    )

    op.create_table(
        "device_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.Integer(), nullable=False),
        sa.Column(
            "connected_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("disconnected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("remote_ip", sa.String(length=45), nullable=True),
        sa.Column("bytes_in", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "telemetry_points",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("device_id", sa.Integer(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("speed_kmh", sa.Float(), nullable=True),
        sa.Column("heading_deg", sa.Float(), nullable=True),
        sa.Column("ignition_on", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id", "recorded_at"),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"]),
        sa.Index("ix_telemetry_points_device_id_recorded_at", "device_id", "recorded_at"),
        postgresql_partition_by="RANGE (recorded_at)",
    )

    op.create_table(
        "vehicle_latest",
        sa.Column("vehicle_id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.Integer(), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("speed_kmh", sa.Float(), nullable=True),
        sa.Column("heading_deg", sa.Float(), nullable=True),
        sa.Column("ignition_on", sa.Boolean(), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "status",
            sa.Enum("moving", "standing", "stale", "offline", name="vehiclestatus"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"]),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"]),
        sa.PrimaryKeyConstraint("vehicle_id"),
    )

    op.create_table(
        "video_clips",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.Integer(), nullable=False),
        sa.Column("channel_no", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("file_path", sa.Text(), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    today = date.today()
    for offset in (0, 1):
        name, start_ts, end_ts = _month_bounds(today, offset)
        op.execute(
            f"CREATE TABLE {name} PARTITION OF telemetry_points "
            f"FOR VALUES FROM ('{start_ts}') TO ('{end_ts}')"
        )


def downgrade() -> None:
    today = date.today()
    for offset in (1, 0):
        name, _, _ = _month_bounds(today, offset)
        op.execute(f"DROP TABLE IF EXISTS {name}")

    op.drop_table("video_clips")
    op.drop_table("vehicle_latest")
    op.drop_table("telemetry_points")
    op.drop_table("device_sessions")
    op.drop_table("device_channels")
    op.drop_table("devices")
    op.drop_table("vehicles")

    op.execute("DROP TYPE IF EXISTS vehiclestatus")
    op.execute("DROP TYPE IF EXISTS protocol")
    op.execute("DROP TYPE IF EXISTS licensestatus")
    op.execute("DROP TYPE IF EXISTS vehicletype")
