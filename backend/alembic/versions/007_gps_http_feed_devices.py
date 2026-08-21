"""Add GPS HTTP feed metadata to devices.

Revision ID: 007
Revises: 006
"""

from alembic import op
import sqlalchemy as sa

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE protocol ADD VALUE IF NOT EXISTS 'http_json'")
    op.execute("ALTER TYPE devicesource ADD VALUE IF NOT EXISTS 'browser'")
    op.execute("ALTER TYPE devicesource ADD VALUE IF NOT EXISTS 'gps_http'")
    op.execute("ALTER TYPE connectionstatus ADD VALUE IF NOT EXISTS 'waiting_for_fix'")
    op.add_column("devices", sa.Column("gps_feed_url", sa.String(length=2048), nullable=True))
    op.add_column(
        "devices",
        sa.Column("gps_feed_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("devices", "gps_feed_enabled", server_default=None)


def downgrade() -> None:
    op.drop_column("devices", "gps_feed_enabled")
    op.drop_column("devices", "gps_feed_url")
