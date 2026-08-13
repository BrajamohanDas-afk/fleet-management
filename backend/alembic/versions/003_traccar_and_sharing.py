"""Add external tracker metadata and expiring public share links."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE TYPE devicesource AS ENUM ('simulator', 'traccar', 'jt808')")
    op.execute(
        "CREATE TYPE connectionstatus AS ENUM "
        "('waiting', 'connected', 'stale', 'auth_error', 'unknown_device', 'unavailable')"
    )
    op.add_column("devices", sa.Column("source", sa.Enum("simulator", "traccar", "jt808", name="devicesource"), nullable=True))
    op.add_column("devices", sa.Column("external_device_id", sa.Integer(), nullable=True))
    op.add_column("devices", sa.Column("external_device_identifier", sa.String(128), nullable=True))
    op.add_column("devices", sa.Column("connection_status", sa.Enum("waiting", "connected", "stale", "auth_error", "unknown_device", "unavailable", name="connectionstatus"), nullable=True))
    op.add_column("devices", sa.Column("last_external_sync_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE devices SET source = 'simulator', connection_status = 'waiting'")
    op.alter_column("devices", "source", nullable=False)
    op.alter_column("devices", "connection_status", nullable=False)
    op.create_unique_constraint("uq_devices_external_device_id", "devices", ["external_device_id"])
    op.create_unique_constraint("uq_devices_external_device_identifier", "devices", ["external_device_identifier"])

    op.create_table(
        "share_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("vehicle_id", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.String(128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_access_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_share_links_vehicle_id", "share_links", ["vehicle_id"])


def downgrade() -> None:
    op.drop_index("ix_share_links_vehicle_id", table_name="share_links")
    op.drop_table("share_links")
    op.drop_constraint("uq_devices_external_device_identifier", "devices", type_="unique")
    op.drop_constraint("uq_devices_external_device_id", "devices", type_="unique")
    op.drop_column("devices", "last_external_sync_at")
    op.drop_column("devices", "connection_status")
    op.drop_column("devices", "external_device_identifier")
    op.drop_column("devices", "external_device_id")
    op.drop_column("devices", "source")
    op.execute("DROP TYPE connectionstatus")
    op.execute("DROP TYPE devicesource")
