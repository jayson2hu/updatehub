"""station_community_updates

Revision ID: 8e52286e943a
Revises: 7b50d52a94fc
"""
from alembic import op
import sqlalchemy as sa


revision = '8e52286e943a'
down_revision = '7b50d52a94fc'
branch_labels = None
depends_on = None


def upgrade():
    # Additive only: existing catalog, users and audit records are preserved.
    op.create_table('station_announcement',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('slug', sa.String(length=160), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('summary', sa.String(length=600), nullable=False),
    sa.Column('body', sa.Text(), nullable=False),
    sa.Column('category', sa.String(length=20), nullable=False),
    sa.Column('importance', sa.String(length=20), nullable=False),
    sa.Column('pinned', sa.Boolean(), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('images', sa.JSON(), nullable=False),
    sa.Column('links', sa.JSON(), nullable=False),
    sa.Column('published', sa.Boolean(), nullable=False),
    sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('is_demo', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('slug')
    )
    op.create_index(op.f('ix_station_announcement_published'), 'station_announcement', ['published'], unique=False)
    op.create_table('station_promotion',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('slug', sa.String(length=160), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('summary', sa.String(length=600), nullable=False),
    sa.Column('body', sa.Text(), nullable=False),
    sa.Column('cover_url', sa.String(length=2048), nullable=False),
    sa.Column('action_label', sa.String(length=60), nullable=False),
    sa.Column('target_url', sa.String(length=2048), nullable=False),
    sa.Column('starts_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('ends_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('published', sa.Boolean(), nullable=False),
    sa.Column('placements', sa.JSON(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('slug')
    )
    op.create_table('station_settings',
    sa.Column('id', sa.String(length=20), nullable=False),
    sa.Column('site_name', sa.String(length=60), nullable=False),
    sa.Column('site_description', sa.String(length=300), nullable=False),
    sa.Column('instructions', sa.Text(), nullable=False),
    sa.Column('ads_enabled', sa.Boolean(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('station_software',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('slug', sa.String(length=160), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('aliases', sa.JSON(), nullable=False),
    sa.Column('summary', sa.String(length=500), nullable=False),
    sa.Column('icon_url', sa.String(length=2048), nullable=False),
    sa.Column('color', sa.String(length=7), nullable=False),
    sa.Column('platforms', sa.JSON(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('status_reason', sa.String(length=1000), nullable=False),
    sa.Column('installation', sa.JSON(), nullable=False),
    sa.Column('faqs', sa.JSON(), nullable=False),
    sa.Column('screenshots', sa.JSON(), nullable=False),
    sa.Column('published', sa.Boolean(), nullable=False),
    sa.Column('is_demo', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('slug')
    )
    op.create_index(op.f('ix_station_software_published'), 'station_software', ['published'], unique=False)
    op.create_table('station_announcement_software',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('announcement_id', sa.String(length=36), nullable=False),
    sa.Column('software_id', sa.String(length=36), nullable=False),
    sa.ForeignKeyConstraint(['announcement_id'], ['station_announcement.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['software_id'], ['station_software.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('announcement_id', 'software_id', name='uq_station_notice_software')
    )
    op.create_index(op.f('ix_station_announcement_software_announcement_id'), 'station_announcement_software', ['announcement_id'], unique=False)
    op.create_index(op.f('ix_station_announcement_software_software_id'), 'station_announcement_software', ['software_id'], unique=False)
    op.create_table('station_release',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('software_id', sa.String(length=36), nullable=False),
    sa.Column('platform', sa.String(length=20), nullable=False),
    sa.Column('version', sa.String(length=80), nullable=False),
    sa.Column('summary', sa.String(length=500), nullable=False),
    sa.Column('notes', sa.Text(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('status_reason', sa.String(length=1000), nullable=False),
    sa.Column('install_notice', sa.String(length=2000), nullable=False),
    sa.Column('published', sa.Boolean(), nullable=False),
    sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['software_id'], ['station_software.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_station_release_published'), 'station_release', ['published'], unique=False)
    op.create_index('ix_station_release_software_platform_date', 'station_release', ['software_id', 'platform', 'published_at'], unique=False)
    op.create_table('station_release_link',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('release_id', sa.String(length=36), nullable=False),
    sa.Column('label', sa.String(length=100), nullable=False),
    sa.Column('url', sa.String(length=2048), nullable=False),
    sa.Column('code', sa.String(length=100), nullable=False),
    sa.Column('is_primary', sa.Boolean(), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['release_id'], ['station_release.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_station_release_link_release_id'), 'station_release_link', ['release_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_station_release_link_release_id'), table_name='station_release_link')
    op.drop_table('station_release_link')
    op.drop_index('ix_station_release_software_platform_date', table_name='station_release')
    op.drop_index(op.f('ix_station_release_published'), table_name='station_release')
    op.drop_table('station_release')
    op.drop_index(op.f('ix_station_announcement_software_software_id'), table_name='station_announcement_software')
    op.drop_index(op.f('ix_station_announcement_software_announcement_id'), table_name='station_announcement_software')
    op.drop_table('station_announcement_software')
    op.drop_index(op.f('ix_station_software_published'), table_name='station_software')
    op.drop_table('station_software')
    op.drop_table('station_settings')
    op.drop_table('station_promotion')
    op.drop_index(op.f('ix_station_announcement_published'), table_name='station_announcement')
    op.drop_table('station_announcement')
