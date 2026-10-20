"""Persist the opt-in WeChat download guide independently of Xiaohongshu.

Revision ID: e4719f0c2b86
Revises: d13c8e2a4f90
"""
from alembic import op
import sqlalchemy as sa

revision = "e4719f0c2b86"
down_revision = "d13c8e2a4f90"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("station_settings") as batch:
        batch.add_column(sa.Column("wechat_inapp_hint", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    with op.batch_alter_table("station_settings") as batch:
        batch.drop_column("wechat_inapp_hint")
