import logging
import re
import unicodedata
from datetime import timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import AnalyticsDaily, AuditLog, ContentDocument, OfficialLink, ReleaseUpdate, Software
from app.models.entities import utcnow
from app.repositories.content import ContentRepository
from app.schemas.analytics import AnalyticsRead, DailyCount, DashboardRead, DashboardTotals, LinkClickCount, SearchCount, SoftwareClickCount, SoftwareGap
from app.schemas.catalog import AuditRead
from app.schemas.content import content_read
from app.schemas.updates import UpdateRead

logger = logging.getLogger("updatehub")
RETENTION_DAYS = 90
HIDDEN_QUERY = "已隐藏的搜索词"


def safe_query(query):
    """Keep ordinary short phrases, drop likely identifiers instead of hashing them.

    This is a conservative format filter, not a guarantee that arbitrary natural
    language is free of personal information. Public privacy text explains storage.
    """
    query = unicodedata.normalize("NFKC", query).strip().casefold()
    if any(unicodedata.category(char).startswith("C") for char in query):
        return HIDDEN_QUERY
    query = " ".join(query.split())
    patterns = (
        r"[@:/\\?#=&]",  # Email, URLs, IP variants, file paths and parameter tokens.
        r"(?:\d[\s.()+-]*){5,}",  # Phone numbers, IDs and long numeric identifiers.
        r"\b(?:\d{1,3}\.){3}\d{1,3}\b",
        r"\b[a-z0-9-]+\.(?:com|net|org|cn|io|dev|app|me|xyz|edu|gov)\b",
        r"\b(?:bearer|password|passwd|secret|token|api[ _-]?key|sk-[a-z0-9]+)\b",
        r"(?:密码|口令|身份证|手机号|电话号码|住址|家庭地址|邮箱)",
        r"\b[a-z0-9_-]{24,}\b",  # UUIDs / credentials / opaque identifiers.
    )
    if not query or len(query) > 80 or any(re.search(pattern, query, re.I) for pattern in patterns):
        return HIDDEN_QUERY
    return query


class AnalyticsService:
    def __init__(self, db: Session):
        self.db = db

    def purge(self, *, all_data=False):
        statement = delete(AnalyticsDaily)
        if not all_data:
            statement = statement.where(AnalyticsDaily.day < utcnow().date() - timedelta(days=RETENTION_DAYS - 1))
        result = self.db.execute(statement)
        self.db.commit()
        return result.rowcount

    def record(self, *, event, scope, key, no_results=0, software_id=None, official_link_id=None):
        day = utcnow().date()
        insert = pg_insert if self.db.bind.dialect.name == "postgresql" else sqlite_insert
        values = dict(day=day, event=event, scope=scope, key=key, count=1, no_result_count=no_results, software_id=software_id, official_link_id=official_link_id)
        statement = insert(AnalyticsDaily).values(**values)
        statement = statement.on_conflict_do_update(index_elements=["day", "event", "scope", "key"], set_={"count": AnalyticsDaily.count + 1, "no_result_count": AnalyticsDaily.no_result_count + no_results})
        try:
            self.db.execute(statement)
            self.db.execute(delete(AnalyticsDaily).where(AnalyticsDaily.day < day - timedelta(days=RETENTION_DAYS - 1)))
            self.db.commit()
        except SQLAlchemyError:
            # A metrics outage must not block an official redirect. Never log
            # queries, URLs, identifiers, request bodies or database exception data.
            self.db.rollback()
            logger.warning("daily analytics storage unavailable")

    def search(self, body):
        self.record(event="search", scope=body.scope, key=safe_query(body.query), no_results=int(body.result_count == 0))

    def official_click(self, link):
        self.record(event="official_click", scope="official", key=link.id, software_id=link.software_id, official_link_id=link.id)

    def summary(self, days):
        today = utcnow().date()
        since = today - timedelta(days=days - 1)
        period = (AnalyticsDaily.day >= since, AnalyticsDaily.day <= today)
        daily = {since + timedelta(days=offset): DailyCount(date=since + timedelta(days=offset)) for offset in range(days)}
        grouped = self.db.execute(select(AnalyticsDaily.day, AnalyticsDaily.event, func.sum(AnalyticsDaily.count), func.sum(AnalyticsDaily.no_result_count)).where(*period).group_by(AnalyticsDaily.day, AnalyticsDaily.event))
        for day, event, count, no_results in grouped:
            if event == "search":
                daily[day].searches = count
                daily[day].no_result_searches = no_results
            elif event == "official_click":
                daily[day].official_clicks = count
        search_statement = select(AnalyticsDaily.key, AnalyticsDaily.scope, func.sum(AnalyticsDaily.count).label("total"), func.sum(AnalyticsDaily.no_result_count).label("empty")).where(*period, AnalyticsDaily.event == "search").group_by(AnalyticsDaily.key, AnalyticsDaily.scope)
        def search_rows(statement):
            return [SearchCount(query=key, scope=scope, searches=total, no_result_searches=empty) for key, scope, total, empty in self.db.execute(statement)]
        top_searches = search_rows(search_statement.order_by(func.sum(AnalyticsDaily.count).desc(), AnalyticsDaily.key, AnalyticsDaily.scope).limit(20))
        no_result_searches = search_rows(search_statement.having(func.sum(AnalyticsDaily.no_result_count) > 0).order_by(func.sum(AnalyticsDaily.no_result_count).desc(), AnalyticsDaily.key, AnalyticsDaily.scope).limit(20))
        software_statement = select(Software.id, Software.name, Software.slug, func.sum(AnalyticsDaily.count)).join(Software, Software.id == AnalyticsDaily.software_id).where(*period, AnalyticsDaily.event == "official_click").group_by(Software.id, Software.name, Software.slug).order_by(func.sum(AnalyticsDaily.count).desc(), Software.id).limit(20)
        link_statement = select(OfficialLink.id, OfficialLink.software_id, OfficialLink.label, func.sum(AnalyticsDaily.count)).join(OfficialLink, OfficialLink.id == AnalyticsDaily.official_link_id).where(*period, AnalyticsDaily.event == "official_click").group_by(OfficialLink.id, OfficialLink.software_id, OfficialLink.label).order_by(func.sum(AnalyticsDaily.count).desc(), OfficialLink.id).limit(20)
        return AnalyticsRead(
            searches=sum(row.searches for row in daily.values()), no_result_searches=sum(row.no_result_searches for row in daily.values()), official_clicks=sum(row.official_clicks for row in daily.values()), daily=list(daily.values()),
            top_searches=top_searches, top_no_result_searches=no_result_searches,
            top_software=[SoftwareClickCount(software_id=software_id, name=name, slug=slug, clicks=count) for software_id, name, slug, count in self.db.execute(software_statement)],
            top_links=[LinkClickCount(official_link_id=link_id, software_id=software_id, label=label, clicks=count) for link_id, software_id, label, count in self.db.execute(link_statement)],
        )


class DashboardService:
    def __init__(self, db: Session):
        self.db = db

    def count(self, model, *conditions):
        return self.db.scalar(select(func.count()).select_from(model).where(*conditions))

    def read(self, days):
        totals = DashboardTotals(
            software=self.count(Software), published_software=self.count(Software, Software.published.is_(True)),
            updates=self.count(ReleaseUpdate), published_updates=self.count(ReleaseUpdate, ReleaseUpdate.status == "published"),
            guides=self.count(ContentDocument, ContentDocument.kind == "guide"), faq=self.count(ContentDocument, ContentDocument.kind == "faq"), collections=self.count(ContentDocument, ContentDocument.kind == "collection"),
            published_content=self.count(ContentDocument, ContentDocument.status == "published"), pending_content=self.count(ContentDocument, ContentDocument.status == "draft"), pending_updates=self.count(ReleaseUpdate, ReleaseUpdate.status.in_(["draft", "review"])),
        )
        pending_content = self.db.scalars(select(ContentDocument).where(ContentDocument.status == "draft").order_by(ContentDocument.updated_at.desc(), ContentDocument.id).limit(10)).all()
        pending_updates = self.db.scalars(select(ReleaseUpdate).where(ReleaseUpdate.status.in_(["draft", "review"])).order_by(ReleaseUpdate.updated_at.desc(), ReleaseUpdate.id).limit(10)).all()
        linked = self.db.execute(select(ContentDocument.software_id, ContentDocument.kind).where(ContentRepository.public_condition(), ContentDocument.software_id.is_not(None))).all()
        guides = {software_id for software_id, kind in linked if kind == "guide"}
        faq = {software_id for software_id, kind in linked if kind == "faq"}
        gaps = []
        # Limit displayed work items; operators can continue in paginated catalogs.
        for software in self.db.scalars(select(Software).where(Software.published.is_(True)).order_by(Software.updated_at.desc(), Software.id)):
            missing = []
            if not any(link.is_active for link in software.official_links):
                missing.append("official_link")
            if not (software.latest_version or "").strip():
                missing.append("version")
            if software.id not in guides:
                missing.append("guide")
            if software.id not in faq:
                missing.append("faq")
            if missing:
                gaps.append(SoftwareGap(software_id=software.id, name=software.name, slug=software.slug, missing=missing))
            if len(gaps) == 50:
                break
        actions = self.db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc(), AuditLog.id).limit(10)).all()
        return DashboardRead(days=days, totals=totals, analytics=AnalyticsService(self.db).summary(days), pending_content=[content_read(item) for item in pending_content], pending_updates=[UpdateRead.model_validate(item) for item in pending_updates], gaps=gaps, recent_actions=[AuditRead.model_validate(item) for item in actions])
