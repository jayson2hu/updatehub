from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.orm import Session

from app.models import Category, ContentDocument, ContentItem, Software, SoftwareAlias, SoftwarePlatform, SoftwarePurpose
from app.repositories.catalog import normalized


class ContentRepository:
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def public_condition():
        return and_(
            ContentDocument.status == "published",
            or_(ContentDocument.software_id.is_(None), ContentDocument.software.has(Software.published.is_(True))),
            or_(ContentDocument.kind != "collection", ContentDocument.items.any(ContentItem.software.has(Software.published.is_(True)))),
        )

    def by_id(self, document_id, *, lock=False):
        statement = select(ContentDocument).where(ContentDocument.id == document_id)
        return self.db.scalar(statement.with_for_update() if lock else statement)

    def public_by_slug(self, kind, slug):
        return self.db.scalar(select(ContentDocument).where(ContentDocument.kind == kind, ContentDocument.slug == slug, self.public_condition()))

    def array_contains(self, column, value):
        # JSON scalar expansion, not string LIKE: exact semantics for both engines.
        function = func.json_array_elements_text(column) if self.db.bind.dialect.name == "postgresql" else func.json_each(column)
        values = function.table_valued("value")
        return exists(select(1).select_from(values).where(values.c.value == value))

    def section_contains(self, query):
        if self.db.bind.dialect.name == "postgresql":
            values = func.json_array_elements(ContentDocument.sections).table_valued("value")
            title, body = (values.c.value.op("->>")(key) for key in ("title", "body"))
        else:
            values = func.json_each(ContentDocument.sections).table_valued("value")
            title, body = (func.json_extract(values.c.value, "$." + key) for key in ("title", "body"))
        return exists(select(1).select_from(values).where(or_(func.lower(title).contains(query, autoescape=True), func.lower(body).contains(query, autoescape=True))))

    def list(self, *, kind="", status="", q="", software_id="", category="", platform="", purpose="", page=1, page_size=12, admin=False):
        statement = select(ContentDocument)
        if not admin:
            statement = statement.where(self.public_condition())
        if kind:
            statement = statement.where(ContentDocument.kind == kind)
        if admin and status:
            statement = statement.where(ContentDocument.status == status)
        if q.strip():
            query = normalized(q)
            software_match = or_(func.lower(Software.name).contains(query, autoescape=True), func.lower(Software.short_name).contains(query, autoescape=True), Software.alias_rows.any(SoftwareAlias.normalized_alias.contains(query, autoescape=True)))
            if not admin:
                software_match = and_(Software.published.is_(True), software_match)
            statement = statement.where(or_(
                func.lower(ContentDocument.title).contains(query, autoescape=True),
                func.lower(ContentDocument.summary).contains(query, autoescape=True),
                func.lower(ContentDocument.content).contains(query, autoescape=True),
                self.section_contains(query),
                ContentDocument.software.has(software_match),
                ContentDocument.items.any(ContentItem.software.has(software_match)),
            ))
        if software_id:
            member = ContentItem.software_id == software_id
            if not admin:
                member = and_(member, ContentItem.software.has(Software.published.is_(True)))
            statement = statement.where(or_(ContentDocument.software_id == software_id, ContentDocument.items.any(member)))
        if category:
            statement = statement.where(ContentDocument.category.has(or_(Category.slug == category, Category.id == category)))
        for value, column, relation in (
            (platform, ContentDocument.platforms, Software.platform_rows.any(SoftwarePlatform.platform == platform)),
            (purpose, ContentDocument.purposes, Software.purpose_rows.any(SoftwarePurpose.purpose == purpose)),
        ):
            if value:
                software_match = relation if admin else and_(Software.published.is_(True), relation)
                statement = statement.where(or_(self.array_contains(column, value), ContentDocument.software.has(software_match), ContentDocument.items.any(ContentItem.software.has(software_match))))
        total = self.db.scalar(select(func.count()).select_from(statement.subquery()))
        statement = statement.order_by(ContentDocument.sort_order, ContentDocument.published_at.desc().nullslast(), ContentDocument.created_at.desc(), ContentDocument.id).offset((page - 1) * page_size).limit(page_size)
        return self.db.scalars(statement).all(), total
