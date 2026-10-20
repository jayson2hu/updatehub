"""Persist software pricing, listing date and illustrated device guides.

Revision ID: d13c8e2a4f90
Revises: 40c28a9e6d31
"""
import sqlalchemy as sa
from alembic import op

revision = "d13c8e2a4f90"
down_revision = "40c28a9e6d31"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("station_software") as batch:
        batch.add_column(sa.Column("install_illustrations", sa.JSON(), nullable=False, server_default="{}"))
        batch.add_column(sa.Column("install_tips", sa.JSON(), nullable=False, server_default="{}"))
        batch.add_column(sa.Column("pricing", sa.String(200), nullable=False, server_default=""))
        batch.add_column(sa.Column("listed_at", sa.Date(), nullable=True))
    for table in ("station_release", "station_announcement"):
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"))


def downgrade():
    for table in ("station_release", "station_announcement"):
        with op.batch_alter_table(table) as batch:
            batch.drop_column("view_count")
    with op.batch_alter_table("station_software") as batch:
        for name in ("listed_at", "pricing", "install_tips", "install_illustrations"):
            batch.drop_column(name)
