"""Add admin trip management for tracking sessions.

Revision ID: 005
Revises: 004
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

trip_status = postgresql.ENUM(
    "CREATED",
    "ACTIVE",
    "COMPLETED",
    "CANCELLED",
    name="tripstatus",
    create_type=False,
)


def upgrade() -> None:
    op.execute("CREATE TYPE tripstatus AS ENUM ('CREATED', 'ACTIVE', 'COMPLETED', 'CANCELLED')")

    op.create_table(
        "drivers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("phone", sa.String(32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "trips",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("vehicle_id", sa.Integer(), nullable=False),
        sa.Column("driver_id", sa.Integer(), nullable=True),
        sa.Column("status", trip_status, nullable=False),
        sa.Column("origin", sa.Text(), nullable=True),
        sa.Column("destination", sa.Text(), nullable=True),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["driver_id"], ["drivers.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_trips_vehicle_id", "trips", ["vehicle_id"])
    op.create_index("ix_trips_driver_id", "trips", ["driver_id"])
    op.create_index("ix_trips_status", "trips", ["status"])

    op.drop_index("ix_tracking_sessions_vehicle_id", table_name="tracking_sessions")
    op.drop_constraint(
        "tracking_sessions_vehicle_id_fkey",
        "tracking_sessions",
        type_="foreignkey",
    )
    op.drop_column("tracking_sessions", "vehicle_id")

    op.add_column("tracking_sessions", sa.Column("trip_id", sa.Integer(), nullable=False))
    op.create_foreign_key(
        "fk_tracking_sessions_trip_id_trips",
        "tracking_sessions",
        "trips",
        ["trip_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_tracking_sessions_trip_id", "tracking_sessions", ["trip_id"])
    op.create_index("ix_tracking_sessions_status", "tracking_sessions", ["status"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actor_username", sa.String(128), nullable=True),
        sa.Column("trip_id", sa.Integer(), nullable=True),
        sa.Column("tracking_session_id", sa.Integer(), nullable=True),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tracking_session_id"], ["tracking_sessions.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_audit_logs_trip_id", "audit_logs", ["trip_id"])
    op.create_index("ix_audit_logs_tracking_session_id", "audit_logs", ["tracking_session_id"])
    op.create_index("ix_audit_logs_event_type", "audit_logs", ["event_type"])


def downgrade() -> None:
    op.drop_index("ix_audit_logs_event_type", table_name="audit_logs")
    op.drop_index("ix_audit_logs_tracking_session_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_trip_id", table_name="audit_logs")
    op.drop_table("audit_logs")

    op.drop_index("ix_tracking_sessions_status", table_name="tracking_sessions")
    op.drop_index("ix_tracking_sessions_trip_id", table_name="tracking_sessions")
    op.drop_constraint(
        "fk_tracking_sessions_trip_id_trips",
        "tracking_sessions",
        type_="foreignkey",
    )
    op.drop_column("tracking_sessions", "trip_id")
    op.add_column("tracking_sessions", sa.Column("vehicle_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "tracking_sessions_vehicle_id_fkey",
        "tracking_sessions",
        "vehicles",
        ["vehicle_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_tracking_sessions_vehicle_id", "tracking_sessions", ["vehicle_id"])

    op.drop_index("ix_trips_status", table_name="trips")
    op.drop_index("ix_trips_driver_id", table_name="trips")
    op.drop_index("ix_trips_vehicle_id", table_name="trips")
    op.drop_table("trips")
    op.drop_table("drivers")

    op.execute("DROP TYPE tripstatus")
