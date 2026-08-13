"""store RTSP camera sources for protocol-layer relays

Revision ID: 002
Revises: 001
"""

from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("device_channels", sa.Column("rtsp_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("device_channels", "rtsp_url")
