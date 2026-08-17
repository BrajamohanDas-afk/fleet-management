"""Add public browser tracking ingestion tables.

Revision ID: 004
Revises: 003
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

tracking_session_status = postgresql.ENUM(
    "CREATED",
    "WAITING_FOR_DRIVER",
    "ACTIVE",
    "PAUSED",
    "OFFLINE",
    "COMPLETED",
    "EXPIRED",
    "REVOKED",
    "PERMISSION_DENIED",
    name="trackingsessionstatus",
    create_type=False,
)
location_quality = postgresql.ENUM(
    "GOOD",
    "USABLE",
    "QUESTIONABLE",
    "LOW_QUALITY",
    "SUSPICIOUS",
    name="locationquality",
    create_type=False,
)


def upgrade() -> None:
    op.execute("ALTER TYPE devicesource ADD VALUE IF NOT EXISTS 'browser'")
    op.execute(
        "CREATE TYPE trackingsessionstatus AS ENUM "
        "('CREATED', 'WAITING_FOR_DRIVER', 'ACTIVE', 'PAUSED', 'OFFLINE', "
        "'COMPLETED', 'EXPIRED', 'REVOKED', 'PERMISSION_DENIED')"
    )
    op.execute(
        "CREATE TYPE locationquality AS ENUM "
        "('GOOD', 'USABLE', 'QUESTIONABLE', 'LOW_QUALITY', 'SUSPICIOUS')"
    )
    op.create_table(
        "tracking_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("vehicle_id", sa.Integer(), nullable=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("installation_id", sa.String(128), nullable=True),
        sa.Column("status", tracking_session_status, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_tracking_sessions_vehicle_id", "tracking_sessions", ["vehicle_id"])

    op.create_table(
        "location_points",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("sequence", sa.BigInteger(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("accuracy", sa.Float(), nullable=True),
        sa.Column("speed_device", sa.Float(), nullable=True),
        sa.Column("speed_calculated", sa.Float(), nullable=True),
        sa.Column("heading", sa.Float(), nullable=True),
        sa.Column("altitude", sa.Float(), nullable=True),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("quality", location_quality, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["session_id"], ["tracking_sessions.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "session_id",
            "sequence",
            name="uq_location_points_session_sequence",
        ),
    )
    op.create_index(
        "ix_location_points_session_captured_at",
        "location_points",
        ["session_id", "captured_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_location_points_session_captured_at", table_name="location_points")
    op.drop_table("location_points")
    op.drop_index("ix_tracking_sessions_vehicle_id", table_name="tracking_sessions")
    op.drop_table("tracking_sessions")
    op.execute("DROP TYPE locationquality")
    op.execute("DROP TYPE trackingsessionstatus")
