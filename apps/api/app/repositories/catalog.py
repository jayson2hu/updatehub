import unicodedata
import re

from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.models import AuditLog, Category, OfficialLink, Software, SoftwareAlias, SoftwarePlatform, SoftwarePurpose, SoftwareTag


def normalized(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


class CatalogRepository:
    def __init__(self, db: Session):
        self.db = db

    def finder_ids(self, query):
        matches = set()
        # Project controlled catalog terms, never generate recommendations from
        # arbitrary prose. Public visibility is enforced again by the final query.
        sources = (
            select(Software.id, Software.name).where(Software.published.is_(True)),
            select(Software.id, Software.short_name).where(Software.published.is_(True)),
            select(SoftwareAlias.software_id, SoftwareAlias.normalized_alias).join(Software).where(Software.published.is_(True)),
            select(SoftwarePurpose.software_id, SoftwarePurpose.purpose).join(Software).where(Software.published.is_(True)),
            select(SoftwareTag.software_id, SoftwareTag.tag).join(Software).where(Software.published.is_(True)),
        )
        for statement in sources:
            for software_id, value in self.db.execute(statement):
                term = normalized(value)
                if re.search(r"[^\x00-\x7f]", term):
                    found = len(term) >= 2 and term in query
                else:
                    found = len(term) >= 3 and re.search(r"(?<![a-z0-9])" + re.escape(term) + r"(?![a-z0-9])", query) is not None
                if found:
                    matches.add(software_id)
        return matches

    def list_software(self, *, q="", category="", platform="", page=1, page_size=12, admin=False, finder=False):
        stmt = select(Software)
        if not admin:
            stmt = stmt.where(Software.published.is_(True))
        if category:
            stmt = stmt.where(or_(Software.category_id == category, Software.category.has(Category.slug == category)))
        if platform:
            stmt = stmt.where(Software.platform_rows.any(SoftwarePlatform.platform == platform))
        rank = None
        if q.strip():
            query = normalized(q)
            name_match = func.lower(Software.name).contains(query, autoescape=True)
            alias_match = Software.alias_rows.any(SoftwareAlias.normalized_alias.contains(query, autoescape=True))
            short_match = func.lower(Software.short_name).contains(query, autoescape=True)
            tag_match = Software.tag_rows.any(func.lower(SoftwareTag.tag).contains(query, autoescape=True))
            purpose_match = Software.purpose_rows.any(func.lower(SoftwarePurpose.purpose).contains(query, autoescape=True))
            summary_match = func.lower(Software.summary).contains(query, autoescape=True)
            matches = [name_match, alias_match, short_match, tag_match, purpose_match, summary_match]
            if finder:
                matches.append(Software.id.in_(self.finder_ids(query)))
            stmt = stmt.where(or_(*matches))
            rank = case((name_match, 100), (alias_match, 90), (short_match, 85), (tag_match, 60), (purpose_match, 50), else_=30)
        total = self.db.scalar(select(func.count()).select_from(stmt.subquery()))
        stmt = stmt.order_by(rank.desc(), Software.name, Software.id) if rank is not None else stmt.order_by(Software.created_at, Software.name, Software.id)
        items = self.db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()
        return items, total

    def by_slug(self, slug: str):
        return self.db.scalar(select(Software).where(Software.slug == slug, Software.published.is_(True)))

    def by_id(self, software_id: str):
        return self.db.get(Software, software_id)

    def categories(self):
        return self.db.scalars(select(Category).order_by(Category.sort_order, Category.name)).all()

    def category_used(self, category_id: str):
        return self.db.scalar(select(Software.id).where(Software.category_id == category_id).limit(1)) is not None

    def active_link(self, link_id: str):
        return self.db.scalar(select(OfficialLink).join(Software).where(OfficialLink.id == link_id, OfficialLink.is_active.is_(True), Software.published.is_(True)))

    def audit_page(self, page: int, page_size: int):
        total = self.db.scalar(select(func.count()).select_from(AuditLog))
        items = self.db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc(), AuditLog.id).offset((page - 1) * page_size).limit(page_size)).all()
        return items, total
