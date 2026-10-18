from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import ReleaseUpdate, Software, SoftwareAlias
from app.repositories.catalog import normalized


class UpdateRepository:
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def public_condition():
        return (ReleaseUpdate.status == "published") & or_(ReleaseUpdate.software_id.is_(None), ReleaseUpdate.software.has(Software.published.is_(True)))

    def by_id(self, update_id: str, lock=False):
        statement = select(ReleaseUpdate).where(ReleaseUpdate.id == update_id)
        return self.db.scalar(statement.with_for_update() if lock else statement)

    def public_by_slug(self, slug: str):
        return self.db.scalar(select(ReleaseUpdate).where(ReleaseUpdate.slug == slug, self.public_condition()))

    def list(self, *, q="", kind="", software_id="", software_ids=None, update_level="", status="", page=1, page_size=12, admin=False, include_historical=False):
        statement = select(ReleaseUpdate)
        if not admin:
            statement = statement.where(self.public_condition())
            if not include_historical:
                statement = statement.where(ReleaseUpdate.is_historical.is_(False))
        if q.strip():
            query = normalized(q)
            statement = statement.where(or_(
                func.lower(ReleaseUpdate.title).contains(query, autoescape=True),
                func.lower(ReleaseUpdate.summary).contains(query, autoescape=True),
                func.lower(ReleaseUpdate.content).contains(query, autoescape=True),
                ReleaseUpdate.software.has(or_(func.lower(Software.name).contains(query, autoescape=True), func.lower(Software.short_name).contains(query, autoescape=True), Software.alias_rows.any(SoftwareAlias.normalized_alias.contains(query, autoescape=True))))))
        for field, value in [(ReleaseUpdate.kind, kind), (ReleaseUpdate.software_id, software_id), (ReleaseUpdate.update_level, update_level)]:
            if value:
                statement = statement.where(field == value)
        if software_ids is not None:
            statement = statement.where(ReleaseUpdate.software_id.in_(software_ids))
        if admin and status:
            statement = statement.where(ReleaseUpdate.status == status)
        total = self.db.scalar(select(func.count()).select_from(statement.subquery()))
        statement = statement.order_by(ReleaseUpdate.is_pinned.desc(), ReleaseUpdate.published_at.desc().nullslast(), ReleaseUpdate.created_at.desc(), ReleaseUpdate.id).offset((page - 1) * page_size).limit(page_size)
        return self.db.scalars(statement).all(), total

    def release_day(self):
        """Use UTC on PostgreSQL too, regardless of the connection's timezone."""
        published_day = func.date(func.timezone("UTC", ReleaseUpdate.published_at)) if self.db.bind.dialect.name == "postgresql" else func.date(ReleaseUpdate.published_at)
        return func.coalesce(ReleaseUpdate.official_release_date, published_day)

    def chronological_order(self):
        return self.release_day().desc(), ReleaseUpdate.published_at.desc(), ReleaseUpdate.id.desc()

    def history(self, software_id: str, *, page=1, page_size=12, admin=False, status=""):
        statement = select(ReleaseUpdate).where(ReleaseUpdate.software_id == software_id, ReleaseUpdate.kind == "release")
        if not admin:
            statement = statement.where(self.public_condition())
        elif status:
            statement = statement.where(ReleaseUpdate.status == status)
        total = self.db.scalar(select(func.count()).select_from(statement.subquery()))
        statement = statement.order_by(*self.chronological_order()).offset((page - 1) * page_size).limit(page_size)
        return self.db.scalars(statement).all(), total

    def latest_version_authority(self, software_id: str, include_demo=False):
        # Archiving an announcement does not roll back installed or recorded versions.
        statement = select(ReleaseUpdate).where(ReleaseUpdate.software_id == software_id, ReleaseUpdate.kind == "release", ReleaseUpdate.published_at.is_not(None), ReleaseUpdate.is_historical.is_(False))
        if not include_demo:
            statement = statement.where(ReleaseUpdate.is_demo.is_(False))
        return self.db.scalar(statement.order_by(*self.chronological_order()).limit(1))
