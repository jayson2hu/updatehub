"""content documents and private daily analytics

Revision ID: 7b50d52a94fc
Revises: 3c0114d69cdc
"""
from alembic import op
import sqlalchemy as sa

revision = "7b50d52a94fc"
down_revision = "3c0114d69cdc"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("content_document",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("slug", sa.String(160), nullable=False, unique=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("summary", sa.String(600), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("sections", sa.JSON(), nullable=False),
        sa.Column("software_id", sa.String(36), sa.ForeignKey("software.id"), nullable=True),
        sa.Column("category_id", sa.String(36), sa.ForeignKey("category.id"), nullable=True),
        sa.Column("platforms", sa.JSON(), nullable=False),
        sa.Column("purposes", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_demo", sa.Boolean(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_content_document_kind_status", "content_document", ["kind", "status"])
    op.create_index("ix_content_document_software_id", "content_document", ["software_id"])
    op.create_index("ix_content_document_category_id", "content_document", ["category_id"])
    op.create_table("content_item",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("document_id", sa.String(36), sa.ForeignKey("content_document.id", ondelete="CASCADE"), nullable=False),
        sa.Column("software_id", sa.String(36), sa.ForeignKey("software.id"), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("importance", sa.String(20), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.UniqueConstraint("document_id", "software_id", name="uq_content_item_document_software"),
    )
    op.create_index("ix_content_item_document_id", "content_item", ["document_id"])
    op.create_index("ix_content_item_software_id", "content_item", ["software_id"])
    op.create_table("analytics_daily",
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("event", sa.String(20), primary_key=True),
        sa.Column("scope", sa.String(20), primary_key=True),
        sa.Column("key", sa.String(160), primary_key=True),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("no_result_count", sa.Integer(), nullable=False),
        sa.Column("software_id", sa.String(36), sa.ForeignKey("software.id", ondelete="SET NULL"), nullable=True),
        sa.Column("official_link_id", sa.String(36), sa.ForeignKey("official_link.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade():
    op.drop_table("analytics_daily")
    op.drop_table("content_item")
    op.drop_table("content_document")
