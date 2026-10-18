"""explicit_history_current_release

Revision ID: 3c0114d69cdc
Revises: d9e4582f723c
"""
from alembic import op
import sqlalchemy as sa


revision = '3c0114d69cdc'
down_revision = 'd9e4582f723c'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('release_update', sa.Column('is_historical', sa.Boolean(), server_default=sa.false(), nullable=False))
    op.create_index(op.f('ix_release_update_is_historical'), 'release_update', ['is_historical'], unique=False)
    if op.get_context().dialect.name == 'sqlite':
        with op.batch_alter_table('software') as batch:
            batch.add_column(sa.Column('current_release_id', sa.String(length=36), nullable=True))
            batch.create_foreign_key('fk_software_current_release_id', 'release_update', ['current_release_id'], ['id'], ondelete='SET NULL')
    else:
        op.add_column('software', sa.Column('current_release_id', sa.String(length=36), nullable=True))
        op.create_foreign_key('fk_software_current_release_id', 'software', 'release_update', ['current_release_id'], ['id'], ondelete='SET NULL')
    op.create_index(op.f('ix_software_current_release_id'), 'software', ['current_release_id'], unique=False)
    # Only these explicitly authored demo backfills are classified automatically.
    # Real records retain their existing publication semantics for administrator review.
    op.execute(sa.text("UPDATE release_update SET is_historical = TRUE WHERE is_demo = TRUE AND kind = 'release' AND slug IN ('demo-vscode-release-1-1', 'demo-vscode-release-1-0', 'demo-vscode-release-0-9')"))

    def release_day(alias):
        timestamp = f"timezone('UTC', {alias}.published_at)" if op.get_context().dialect.name == 'postgresql' else f"{alias}.published_at"
        return f"COALESCE({alias}.official_release_date, DATE({timestamp}))"

    # Backfill only a unique matching version with identical facts which is also
    # the existing chronological authority. Ambiguous or manually divergent data
    # stays NULL. No software version, recommendation or announcement is rewritten.
    op.execute(sa.text(f"""
        UPDATE software SET current_release_id = (
            SELECT r.id FROM release_update r
            WHERE r.software_id = software.id AND r.kind = 'release'
              AND r.published_at IS NOT NULL AND r.status IN ('published', 'archived')
              AND r.is_historical = FALSE AND r.is_demo = software.is_demo
              AND r.version = software.latest_version
              AND r.update_level = software.update_level
              AND r.reason_to_update = software.update_reason
              AND (SELECT COUNT(*) FROM release_update duplicate
                   WHERE duplicate.software_id = r.software_id AND duplicate.kind = 'release'
                     AND duplicate.published_at IS NOT NULL AND duplicate.is_historical = FALSE
                     AND duplicate.is_demo = r.is_demo AND duplicate.version = r.version) = 1
              AND NOT EXISTS (
                  SELECT 1 FROM release_update newer
                  WHERE newer.software_id = r.software_id AND newer.kind = 'release'
                    AND newer.published_at IS NOT NULL AND newer.is_historical = FALSE
                    AND newer.is_demo = r.is_demo
                    AND ({release_day('newer')}, newer.published_at, newer.id)
                        > ({release_day('r')}, r.published_at, r.id)
              )
        ) WHERE current_release_id IS NULL
    """))


def downgrade():
    op.drop_index(op.f('ix_software_current_release_id'), table_name='software')
    if op.get_context().dialect.name == 'sqlite':
        with op.batch_alter_table('software') as batch:
            batch.drop_constraint('fk_software_current_release_id', type_='foreignkey')
            batch.drop_column('current_release_id')
    else:
        op.drop_constraint('fk_software_current_release_id', 'software', type_='foreignkey')
        op.drop_column('software', 'current_release_id')
    op.drop_index(op.f('ix_release_update_is_historical'), table_name='release_update')
    op.drop_column('release_update', 'is_historical')
