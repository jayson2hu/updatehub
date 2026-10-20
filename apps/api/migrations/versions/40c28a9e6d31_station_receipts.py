"""Hash sync codes and enable anonymous reversible feedback and wish tracking.

Revision ID: 40c28a9e6d31
Revises: 17199b6ebeec
"""
import hashlib
import sqlalchemy as sa
from alembic import op

revision = "40c28a9e6d31"
down_revision = "17199b6ebeec"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("station_settings") as batch:
        batch.add_column(sa.Column("logo_text", sa.String(4), nullable=False, server_default="喵"))
    with op.batch_alter_table("station_sync_code") as batch:
        batch.alter_column("code", existing_type=sa.String(12), type_=sa.String(64), existing_nullable=False)
    db = op.get_bind()
    if db.dialect.name == 'postgresql':
        # Core PostgreSQL SHA-256 works in generated offline deployment SQL too.
        op.execute("UPDATE station_sync_code SET code=encode(sha256(convert_to(code,'UTF8')),'hex') WHERE length(code) <> 64")
    else:
        codes = db.execute(sa.text("SELECT code FROM station_sync_code")).scalars().all()
        for code in codes:
            if len(code) != 64:
                db.execute(sa.text("UPDATE station_sync_code SET code=:digest WHERE code=:code"), {"digest": hashlib.sha256(code.encode()).hexdigest(), "code": code})
    with op.batch_alter_table("station_feedback_issue") as batch:
        batch.add_column(sa.Column("channel", sa.String(12), nullable=False, server_default="web"))
    op.create_table("station_feedback_spent", sa.Column("digest", sa.String(64), primary_key=True), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_station_feedback_spent_expires_at", "station_feedback_spent", ["expires_at"])
    with op.batch_alter_table("station_wish") as batch:
        batch.add_column(sa.Column("merged_into_id", sa.String(36), nullable=True))
        batch.add_column(sa.Column("platform_votes", sa.JSON(), nullable=False, server_default="{}"))
        batch.add_column(sa.Column("notes", sa.JSON(), nullable=False, server_default="[]"))
        batch.create_foreign_key("fk_station_wish_merged", "station_wish", ["merged_into_id"], ["id"], ondelete="SET NULL")


def downgrade():
    with op.batch_alter_table("station_settings") as batch:
        batch.drop_column("logo_text")
    with op.batch_alter_table("station_wish") as batch:
        batch.drop_constraint("fk_station_wish_merged", type_="foreignkey")
        batch.drop_column("merged_into_id")
        batch.drop_column("platform_votes")
        batch.drop_column("notes")
    op.drop_table("station_feedback_spent")
    with op.batch_alter_table("station_feedback_issue") as batch:
        batch.drop_column("channel")
    # A hash cannot be turned back into a readable code. Only transfer codes expire
    # on rollback; software, releases, feedback counts and uploads are preserved.
    op.execute("DELETE FROM station_sync_code")
    with op.batch_alter_table("station_sync_code") as batch:
        batch.alter_column("code", existing_type=sa.String(64), type_=sa.String(12), existing_nullable=False)
