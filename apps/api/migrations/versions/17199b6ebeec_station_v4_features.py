"""station_v4_features

Additive only: upgrade advice, structured changes, per-device guides,
anonymous feedback, wishes, sync codes and aggregate statistics (docs/v4).

Revision ID: 17199b6ebeec
Revises: 8e52286e943a
"""
from alembic import op
import sqlalchemy as sa


revision = '17199b6ebeec'
down_revision = '8e52286e943a'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('station_stats_daily',
    sa.Column('day', sa.Date(), nullable=False),
    sa.Column('event', sa.String(length=20), nullable=False),
    sa.Column('key', sa.String(length=64), nullable=False),
    sa.Column('count', sa.Integer(), nullable=False),
    sa.PrimaryKeyConstraint('day', 'event', 'key', name='pk_station_stats_daily')
    )
    op.create_table('station_sync_code',
    sa.Column('code', sa.String(length=12), nullable=False),
    sa.Column('software_ids', sa.JSON(), nullable=False),
    sa.Column('device', sa.String(length=20), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('code')
    )
    op.create_index(op.f('ix_station_sync_code_expires_at'), 'station_sync_code', ['expires_at'], unique=False)
    op.create_table('station_wish',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('normalized', sa.String(length=120), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('platforms', sa.JSON(), nullable=False),
    sa.Column('votes', sa.Integer(), nullable=False),
    sa.Column('note', sa.String(length=300), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('software_id', sa.String(length=36), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('handled_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['software_id'], ['station_software.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('normalized')
    )
    op.create_index(op.f('ix_station_wish_status'), 'station_wish', ['status'], unique=False)
    op.create_table('station_feedback_daily',
    sa.Column('release_id', sa.String(length=36), nullable=False),
    sa.Column('day', sa.Date(), nullable=False),
    sa.Column('ok_count', sa.Integer(), nullable=False),
    sa.Column('issue_count', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['release_id'], ['station_release.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('release_id', 'day', name='pk_station_feedback_daily')
    )
    op.create_table('station_feedback_issue',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('release_id', sa.String(length=36), nullable=False),
    sa.Column('link_id', sa.String(length=36), nullable=True),
    sa.Column('kind', sa.String(length=20), nullable=False),
    sa.Column('note', sa.String(length=300), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('handled_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['link_id'], ['station_release_link.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['release_id'], ['station_release.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_station_feedback_issue_created_at'), 'station_feedback_issue', ['created_at'], unique=False)
    op.create_index(op.f('ix_station_feedback_issue_release_id'), 'station_feedback_issue', ['release_id'], unique=False)
    op.create_index(op.f('ix_station_feedback_issue_status'), 'station_feedback_issue', ['status'], unique=False)
    # Batch mode lets SQLite add the self-referencing foreign key.
    with op.batch_alter_table('station_release') as batch:
        batch.add_column(sa.Column('advice', sa.String(length=20), server_default='optional', nullable=False))
        batch.add_column(sa.Column('advice_note', sa.String(length=500), server_default='', nullable=False))
        batch.add_column(sa.Column('stable_release_id', sa.String(length=36), nullable=True))
        batch.add_column(sa.Column('changes', sa.JSON(), server_default='[]', nullable=False))
        batch.add_column(sa.Column('release_date', sa.Date(), nullable=True))
        batch.add_column(sa.Column('package_size', sa.String(length=40), server_default='', nullable=False))
        batch.add_column(sa.Column('requirements', sa.String(length=200), server_default='', nullable=False))
        batch.create_foreign_key('fk_station_release_stable', 'station_release', ['stable_release_id'], ['id'], ondelete='SET NULL')
    with op.batch_alter_table('station_release_link') as batch:
        batch.add_column(sa.Column('kind', sa.String(length=20), server_default='official', nullable=False))
        batch.add_column(sa.Column('is_active', sa.Boolean(), server_default='1', nullable=False))
    with op.batch_alter_table('station_settings') as batch:
        batch.add_column(sa.Column('ad_placements', sa.JSON(), server_default='{}', nullable=False))
        batch.add_column(sa.Column('footer_note', sa.String(length=300), server_default='', nullable=False))
        batch.add_column(sa.Column('icp_number', sa.String(length=60), server_default='', nullable=False))
        batch.add_column(sa.Column('notice_tip', sa.String(length=300), server_default='', nullable=False))
        batch.add_column(sa.Column('inapp_hint', sa.Boolean(), server_default='1', nullable=False))
        batch.add_column(sa.Column('hot_searches', sa.JSON(), server_default='[]', nullable=False))
        batch.add_column(sa.Column('about_text', sa.Text(), server_default='', nullable=False))
        batch.add_column(sa.Column('privacy_text', sa.Text(), server_default='', nullable=False))
        batch.add_column(sa.Column('disclaimer_text', sa.Text(), server_default='', nullable=False))
        batch.add_column(sa.Column('admin_nickname', sa.String(length=30), server_default='', nullable=False))
    with op.batch_alter_table('station_software') as batch:
        batch.add_column(sa.Column('category', sa.String(length=20), server_default='other', nullable=False))
        batch.add_column(sa.Column('description', sa.Text(), server_default='', nullable=False))
        batch.add_column(sa.Column('developer', sa.String(length=120), server_default='', nullable=False))
        batch.add_column(sa.Column('website_url', sa.String(length=2048), server_default='', nullable=False))
        batch.add_column(sa.Column('tags', sa.JSON(), server_default='[]', nullable=False))
        batch.add_column(sa.Column('install_guides', sa.JSON(), server_default='{}', nullable=False))
        batch.add_column(sa.Column('favorite_count', sa.Integer(), server_default='0', nullable=False))
        batch.add_column(sa.Column('view_count', sa.Integer(), server_default='0', nullable=False))
    # ADR-0003: releases that needed attention start as "wait"; others stay optional.
    op.execute("UPDATE station_release SET advice = 'wait' WHERE status = 'attention'")
    # ADR-0001: only replace the untouched previous default site name.
    op.execute("UPDATE station_settings SET site_name = '版本喵' WHERE site_name = '更新小站'")


def downgrade():
    op.execute("UPDATE station_settings SET site_name = '更新小站' WHERE site_name = '版本喵'")
    with op.batch_alter_table('station_software') as batch:
        for column in ('view_count', 'favorite_count', 'install_guides', 'tags', 'website_url', 'developer', 'description', 'category'):
            batch.drop_column(column)
    with op.batch_alter_table('station_settings') as batch:
        for column in ('admin_nickname', 'disclaimer_text', 'privacy_text', 'about_text', 'hot_searches', 'inapp_hint', 'notice_tip', 'icp_number', 'footer_note', 'ad_placements'):
            batch.drop_column(column)
    with op.batch_alter_table('station_release_link') as batch:
        batch.drop_column('is_active')
        batch.drop_column('kind')
    with op.batch_alter_table('station_release') as batch:
        batch.drop_constraint('fk_station_release_stable', type_='foreignkey')
        for column in ('requirements', 'package_size', 'release_date', 'changes', 'stable_release_id', 'advice_note', 'advice'):
            batch.drop_column(column)
    op.drop_index(op.f('ix_station_feedback_issue_status'), table_name='station_feedback_issue')
    op.drop_index(op.f('ix_station_feedback_issue_release_id'), table_name='station_feedback_issue')
    op.drop_index(op.f('ix_station_feedback_issue_created_at'), table_name='station_feedback_issue')
    op.drop_table('station_feedback_issue')
    op.drop_table('station_feedback_daily')
    op.drop_index(op.f('ix_station_wish_status'), table_name='station_wish')
    op.drop_table('station_wish')
    op.drop_index(op.f('ix_station_sync_code_expires_at'), table_name='station_sync_code')
    op.drop_table('station_sync_code')
    op.drop_table('station_stats_daily')
