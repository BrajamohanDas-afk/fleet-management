"""add camera source type metadata

Revision ID: 006
Revises: 005
"""

from alembic import op
import sqlalchemy as sa

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "device_channels",
        sa.Column("source_type", sa.Text(), nullable=False, server_default="rtsp"),
    )
    op.add_column(
        "device_channels",
        sa.Column("source_format", sa.Text(), nullable=False, server_default="rtsp"),
    )
    op.alter_column("device_channels", "source_type", server_default=None)
    op.alter_column("device_channels", "source_format", server_default=None)


def downgrade() -> None:
    op.drop_column("device_channels", "source_format")
    op.drop_column("device_channels", "source_type")