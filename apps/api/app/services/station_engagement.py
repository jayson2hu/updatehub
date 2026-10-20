"""Anonymous visitor engagement for the station: feedback, wishes, favourites
sync codes and aggregate statistics. See docs/v4/adr/0005 for the privacy rules:
only daily counters and short, filtered text are stored; never IPs or visitor IDs."""
import logging
import hashlib
import re
import secrets
import unicodedata
from collections import defaultdict
from datetime import date, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.entities import utcnow
from app.models.station import (
    StationAnnouncement, StationFeedbackDaily, StationFeedbackIssue, StationPromotion, StationRelease,
    StationReleaseLink, StationSoftware, StationStatsDaily, StationSyncCode, StationWish, StationFeedbackSpent,
)
from app.schemas.catalog import utc_datetime
from app.schemas.station import (
    AdPlacementStats, BrokenLink, DailyPoint, DashboardCounts, DashboardTotals, FeedbackIssueRead, FeedbackList,
    PromotionStats, RecentRelease, ReleaseFeedback, ReleaseRead, StationDashboard, StationStats, SoftwareStats,
    SyncRead, WishRead, WishReceipt, VoteRead,
)
from app.services.station_receipts import encode_receipt, decode_receipt
from app.services.analytics import HIDDEN_QUERY, safe_query
from app.services.catalog import CatalogService

logger = logging.getLogger("updatehub.station")
STATS_RETENTION_DAYS = 90
ISSUE_RETENTION_DAYS = 180
SYNC_DAYS = 30
SYNC_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"  # No 0/O, 1/I/L.
SYNC_LENGTH = 10
PAGES = {"home", "library", "detail", "announcements", "announcement", "search", "me"}
PLACEMENTS = ("home_feed", "detail_body", "desktop_sidebar")
REDACTED = "［已隐藏］"
BEIJING = timezone(timedelta(hours=8))
CONTACT_PATTERNS = (
    r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+",  # Email.
    r"(?:https?://|www\.)\S+",  # URLs.
    r"(?:\d[\s.()+-]*){7,}",  # Phone numbers and long IDs.
    r"(?:微信|vx|v信|wx|qq|扣扣|电话|手机|tel)[\s:：号]*[\w-]{5,}",
)


def redact(text: str) -> str:
    """Hide contact details visitors may type into free text."""
    text = unicodedata.normalize("NFKC", text).strip()
    text = "".join(char for char in text if not unicodedata.category(char).startswith("C") or char == "\n")
    for pattern in CONTACT_PATTERNS:
        text = re.sub(pattern, REDACTED, text, flags=re.I)
    return text[:300]


def today():
    """Statistics use Beijing calendar days, matching how operators read them."""
    return utcnow().astimezone(BEIJING).date()


def normalize_name(name: str) -> str:
    name = unicodedata.normalize("NFKC", name).casefold()
    name = "".join(char for char in name if char.isalnum())
    return re.sub(r"(?:电视版|tv版|软件|app)$", "", name)[:120]


def _insert(db):
    return pg_insert if db.bind.dialect.name == "postgresql" else sqlite_insert


def enrich_releases(db: Session, releases) -> list[ReleaseRead]:
    """Read models with derived previous version and feedback totals."""
    reads = [ReleaseRead.model_validate(item) for item in releases]
    if not reads:
        return reads
    keys = {(item.software_id, item.platform) for item in reads}
    history = defaultdict(list)
    rows = db.execute(select(StationRelease.id, StationRelease.software_id, StationRelease.platform, StationRelease.version, StationRelease.published_at).where(StationRelease.published.is_(True), StationRelease.software_id.in_({key[0] for key in keys})))
    for release_id, software_id, platform, version, published_at in rows:
        history[(software_id, platform)].append((utc_datetime(published_at), release_id, version))
    for values in history.values():
        values.sort()
    counts = {release_id: (ok, issue) for release_id, ok, issue in db.execute(select(StationFeedbackDaily.release_id, func.sum(StationFeedbackDaily.ok_count), func.sum(StationFeedbackDaily.issue_count)).where(StationFeedbackDaily.release_id.in_([item.id for item in reads])).group_by(StationFeedbackDaily.release_id))}
    for item in reads:
        timeline = history.get((item.software_id, item.platform), [])
        if item.published and item.published_at:
            earlier = [version for moment, release_id, version in timeline if moment < item.published_at and release_id != item.id]
        else:
            earlier = [version for _, release_id, version in timeline if release_id != item.id]
        item.previous_version = earlier[-1] if earlier else ""
        item.feedback_ok, item.feedback_issue = counts.get(item.id, (0, 0))
    return reads


class StatsService:
    def __init__(self, db: Session):
        self.db = db

    def add(self, event, key, amount=1):
        statement = _insert(self.db)(StationStatsDaily).values(day=today(), event=event, key=key, count=amount)
        statement = statement.on_conflict_do_update(index_elements=["day", "event", "key"], set_={"count": StationStatsDaily.count + amount})
        self.db.execute(statement)

    def record(self, events):
        """Store valid events; silently drop unknown keys so clients cannot fill the table."""
        wanted = defaultdict(int)
        for event in events:
            wanted[(event.event, event.key)] += 1
        ids = {key for (_, key) in wanted}
        published_software = set(self.db.scalars(select(StationSoftware.id).where(StationSoftware.id.in_(ids), StationSoftware.published.is_(True))))
        published_releases = set(self.db.scalars(select(StationRelease.id).where(StationRelease.id.in_(ids), StationRelease.published.is_(True))))
        announcements = set(self.db.scalars(select(StationAnnouncement.id).where(StationAnnouncement.id.in_(ids), StationAnnouncement.published.is_(True))))
        promotion_ids = {key.split(":", 1)[1] for (event, key) in wanted if event in {"ad_imp", "ad_click"} and ":" in key}
        promotions = set(self.db.scalars(select(StationPromotion.id).where(StationPromotion.id.in_(promotion_ids)))) if promotion_ids else set()
        favourites, views = defaultdict(int), defaultdict(int)
        try:
            for (event, key), amount in wanted.items():
                if event == "page_view" and key in PAGES:
                    self.add(event, key, amount)
                elif event in {"sw_view", "fav_add", "fav_remove"} and key in published_software:
                    self.add(event, key, amount)
                    if event == "sw_view":
                        views[key] += amount
                    else:
                        favourites[key] += amount if event == "fav_add" else -amount
                elif event == "dl_copy" and key in published_releases:
                    self.add(event, key, amount)
                elif event == "release_view" and key in published_releases:
                    self.add(event, key, amount)
                    self.db.execute(update(StationRelease).where(StationRelease.id == key).values(view_count=StationRelease.view_count + amount))
                elif event == "ann_view" and key in announcements:
                    self.add(event, key, amount)
                    self.db.execute(update(StationAnnouncement).where(StationAnnouncement.id == key).values(view_count=StationAnnouncement.view_count + amount))
                elif event in {"ad_imp", "ad_click"} and ":" in key:
                    placement, promotion_id = key.split(":", 1)
                    if placement in PLACEMENTS and promotion_id in promotions:
                        self.add(event, key, amount)
                elif event in {"search", "search_miss"}:
                    term = safe_query(key)
                    if term != HIDDEN_QUERY:
                        self.add(event, term, amount)
            for software_id, amount in views.items():
                self.db.execute(update(StationSoftware).where(StationSoftware.id == software_id).values(view_count=StationSoftware.view_count + amount))
            for software_id, delta in favourites.items():
                self.db.execute(update(StationSoftware).where(StationSoftware.id == software_id).values(favorite_count=func.max(StationSoftware.favorite_count + delta, 0) if self.db.bind.dialect.name == "sqlite" else func.greatest(StationSoftware.favorite_count + delta, 0)))
            self.db.commit()
        except SQLAlchemyError:
            # Statistics never block visitors. No keys or payloads are logged.
            self.db.rollback()
            logger.warning("station statistics storage unavailable")

    def totals(self, event, days, keys=None):
        since = today() - timedelta(days=days - 1)
        statement = select(StationStatsDaily.key, func.sum(StationStatsDaily.count)).where(StationStatsDaily.event == event, StationStatsDaily.day >= since).group_by(StationStatsDaily.key)
        if keys is not None:
            statement = statement.where(StationStatsDaily.key.in_(keys))
        return {key: count for key, count in self.db.execute(statement)}

    def public(self, software_ids, configured_searches=()):
        views = self.totals("sw_view", 7, software_ids)
        hot = sorted((key for key, count in views.items() if count > 0), key=lambda key: (-views[key], key))[:5]
        searches = self.totals("search", 7)
        terms = list(configured_searches) or sorted(searches, key=lambda key: (-searches[key], key))[:8]
        return StationStats(software={key: SoftwareStats(views_7d=count) for key, count in views.items()}, hot_software=hot, hot_searches=terms)

    def purge(self):
        now = utcnow()
        self.db.execute(delete(StationStatsDaily).where(StationStatsDaily.day < today() - timedelta(days=STATS_RETENTION_DAYS - 1)))
        self.db.execute(delete(StationSyncCode).where(StationSyncCode.expires_at <= now))
        self.db.execute(delete(StationFeedbackIssue).where(StationFeedbackIssue.created_at < now - timedelta(days=ISSUE_RETENTION_DAYS)))
        self.db.execute(delete(StationFeedbackSpent).where(StationFeedbackSpent.expires_at <= now))
        self.db.commit()


class FeedbackService:
    def __init__(self, db: Session):
        self.db = db

    def submit(self, body):
        release = self.db.get(StationRelease, body.release_id)
        software = self.db.get(StationSoftware, release.software_id) if release else None
        if release is None or not release.published or software is None or not software.published:
            raise HTTPException(404, "这个版本已下架，请刷新页面后重试")
        if body.link_id and body.link_id not in {link.id for link in release.links}:
            raise HTTPException(422, "反馈的入口不属于当前版本，请刷新页面后重试")
        ok, issue = (1, 0) if body.verdict == "ok" else (0, 1)
        statement = _insert(self.db)(StationFeedbackDaily).values(release_id=release.id, day=today(), ok_count=ok, issue_count=issue)
        statement = statement.on_conflict_do_update(index_elements=["release_id", "day"], set_={"ok_count": StationFeedbackDaily.ok_count + ok, "issue_count": StationFeedbackDaily.issue_count + issue})
        self.db.execute(statement)
        if body.verdict == "issue":
            self.db.add(StationFeedbackIssue(release_id=release.id, link_id=body.link_id, kind=body.kind, note=redact(body.note)))
        self.db.commit()

    def vote(self, body):
        release = self.db.get(StationRelease, body.release_id)
        if not release or not release.published or not self.db.get(StationSoftware, release.software_id).published:
            raise HTTPException(404, "这个版本已下架，请刷新页面后重试")
        prior = decode_receipt(body.receipt) if body.receipt else None
        day = today()
        if prior:
            if prior.get("release") != release.id:
                raise HTTPException(422, "反馈凭据与当前版本不符")
            day = date.fromisoformat(prior["day"])
            if day < today() - timedelta(days=STATS_RETENTION_DAYS - 1):
                raise HTTPException(410, "这条反馈已超出修改期限，请清除本机旧反馈后重新提交")
            # The unique digest makes repeated/replayed corrections atomic,
            # including across restarts and concurrent API workers.
            self.db.add(StationFeedbackSpent(digest=hashlib.sha256(body.receipt.encode()).hexdigest(), expires_at=utcnow() + timedelta(days=STATS_RETENTION_DAYS)))
            try:
                self.db.flush()
            except IntegrityError:
                self.db.rollback()
                raise HTTPException(409, "这条反馈已在另一页面修改，请刷新后再试") from None
        if body.action == "details":
            if not prior or prior["verdict"] != "issue" or not body.kind:
                raise HTTPException(422, "请先选择有问题，再补充问题类型")
            issue = self.db.get(StationFeedbackIssue, prior.get("issue"))
            if not issue:
                raise HTTPException(404, "这条反馈已经撤销，请重新反馈")
            issue.kind, issue.note = body.kind, redact(body.note)
            payload = {k: v for k, v in prior.items() if k != "nonce"}
        else:
            if prior:
                column = StationFeedbackDaily.ok_count if prior["verdict"] == "ok" else StationFeedbackDaily.issue_count
                self.db.execute(update(StationFeedbackDaily).where(StationFeedbackDaily.release_id == release.id, StationFeedbackDaily.day == day).values({column: column - 1}).where(column > 0))
                if prior.get("issue"):
                    self.db.execute(delete(StationFeedbackIssue).where(StationFeedbackIssue.id == prior["issue"]))
            payload = None
            if body.verdict != "none":
                ok, issue_count = (1, 0) if body.verdict == "ok" else (0, 1)
                statement = _insert(self.db)(StationFeedbackDaily).values(release_id=release.id, day=today(), ok_count=ok, issue_count=issue_count)
                self.db.execute(statement.on_conflict_do_update(index_elements=["release_id", "day"], set_={"ok_count": StationFeedbackDaily.ok_count + ok, "issue_count": StationFeedbackDaily.issue_count + issue_count}))
                issue_id = None
                if body.verdict == "issue":
                    issue = StationFeedbackIssue(release_id=release.id, kind=body.kind or "other", note=redact(body.note), channel=body.channel)
                    self.db.add(issue)
                    self.db.flush()
                    issue_id = issue.id
                payload = {"release": release.id, "verdict": body.verdict, "day": today().isoformat(), "issue": issue_id}
        receipt = encode_receipt(payload) if payload else ""
        self.db.commit()
        ok, issues = self.db.execute(select(func.coalesce(func.sum(StationFeedbackDaily.ok_count), 0), func.coalesce(func.sum(StationFeedbackDaily.issue_count), 0)).where(StationFeedbackDaily.release_id == release.id)).one()
        return VoteRead(receipt=receipt, oks=ok, issues=issues)

    def release_summary(self, days, release_ids=None):
        since = today() - timedelta(days=days - 1)
        statement = select(StationFeedbackDaily.release_id, func.sum(StationFeedbackDaily.ok_count), func.sum(StationFeedbackDaily.issue_count)).where(StationFeedbackDaily.day >= since).group_by(StationFeedbackDaily.release_id)
        if release_ids is not None:
            statement = statement.where(StationFeedbackDaily.release_id.in_(release_ids))
        counts = {release_id: (ok, issue) for release_id, ok, issue in self.db.execute(statement)}
        kinds = defaultdict(dict)
        pending = defaultdict(dict)
        moment = utcnow() - timedelta(days=days)
        for release_id, kind, count in self.db.execute(select(StationFeedbackIssue.release_id, StationFeedbackIssue.kind, func.count()).where(StationFeedbackIssue.created_at >= moment, StationFeedbackIssue.release_id.in_(counts)).group_by(StationFeedbackIssue.release_id, StationFeedbackIssue.kind)):
            kinds[release_id][kind] = count
        for release_id, kind, count in self.db.execute(select(StationFeedbackIssue.release_id, StationFeedbackIssue.kind, func.count()).where(StationFeedbackIssue.created_at >= moment, StationFeedbackIssue.status == "new", StationFeedbackIssue.release_id.in_(counts)).group_by(StationFeedbackIssue.release_id, StationFeedbackIssue.kind)):
            pending[release_id][kind] = count
        rows = self.db.execute(select(StationRelease, StationSoftware).join(StationSoftware, StationSoftware.id == StationRelease.software_id).where(StationRelease.id.in_(counts)))
        result = [ReleaseFeedback(release_id=release.id, software_id=software.id, software_name=software.name, version=release.version, platform=release.platform, advice=release.advice, oks=counts[release.id][0], issues=counts[release.id][1], kinds=kinds.get(release.id, {}), pending_issues=sum(pending[release.id].values()), pending_kinds=pending[release.id]) for release, software in rows]
        return sorted(result, key=lambda item: (-item.issues, -item.oks, item.software_name))

    def issues(self, status=None, kind=None, software_id=None, limit=200):
        statement = select(StationFeedbackIssue, StationRelease, StationSoftware).join(StationRelease, StationRelease.id == StationFeedbackIssue.release_id).join(StationSoftware, StationSoftware.id == StationRelease.software_id).order_by(StationFeedbackIssue.created_at.desc(), StationFeedbackIssue.id).limit(limit)
        if status:
            statement = statement.where(StationFeedbackIssue.status == status)
        if kind:
            statement = statement.where(StationFeedbackIssue.kind == kind)
        if software_id:
            statement = statement.where(StationSoftware.id == software_id)
        labels = {}
        items = []
        for issue, release, software in self.db.execute(statement):
            if issue.link_id and issue.link_id not in labels:
                labels.update({link.id: link.label for link in release.links})
            items.append(FeedbackIssueRead(id=issue.id, release_id=issue.release_id, link_id=issue.link_id, kind=issue.kind, note=issue.note, status=issue.status, created_at=issue.created_at, handled_at=issue.handled_at, software_id=software.id, software_name=software.name, version=release.version, platform=release.platform, link_label=labels.get(issue.link_id, "") if issue.link_id else "", channel=issue.channel))
        return FeedbackList(items=items, releases=self.release_summary(7))

    def update(self, body, admin_id):
        rows = list(self.db.scalars(select(StationFeedbackIssue).where(StationFeedbackIssue.id.in_(body.ids))))
        if len(rows) != len(set(body.ids)):
            raise HTTPException(404, "部分反馈已不存在，请刷新列表后重试")
        now = utcnow()
        for row in rows:
            row.status = body.status
            row.handled_at = None if body.status == "new" else now
        CatalogService(self.db).audit(admin_id, "update", "station_feedback", rows[0].id if len(rows) == 1 else "batch", None, {"ids": body.ids, "status": body.status})
        self.db.commit()
        return len(rows)


class WishService:
    def __init__(self, db: Session):
        self.db = db

    def resolve(self, wish_id):
        item = self.db.get(StationWish, wish_id)
        seen = set()
        while item and item.merged_into_id and item.id not in seen:
            seen.add(item.id)
            item = self.db.get(StationWish, item.merged_into_id)
        if not item:
            raise HTTPException(404, "这条请求已不存在")
        return item

    def receipt(self, item):
        software = self.db.get(StationSoftware, item.software_id) if item.software_id else None
        return WishReceipt(id=item.id, votes=item.votes, status=item.status, software_slug=software.slug if software and software.published else None)

    def submit(self, body):
        normalized = normalize_name(body.name)
        if not normalized:
            raise HTTPException(422, "请填写软件名称")
        name = redact(body.name)[:60]
        note = redact(body.note)
        now = utcnow()
        item = self.db.scalar(select(StationWish).where(StationWish.normalized == normalized))
        if item is None:
            item = StationWish(normalized=normalized, name=name, platforms=list(dict.fromkeys(body.platforms)), platform_votes={p: 1 for p in set(body.platforms)}, notes=[note] if note else [], note=note, votes=1, created_at=now, updated_at=now)
            self.db.add(item)
            try:
                self.db.commit()
                return self.receipt(item)
            except IntegrityError:
                # A concurrent request created the same wish; count this one as a vote.
                self.db.rollback()
                item = self.db.scalar(select(StationWish).where(StationWish.normalized == normalized))
        item = self.resolve(item.id)
        item.votes += 1
        item.platforms = list(dict.fromkeys([*item.platforms, *body.platforms]))
        item.platform_votes = {p: item.platform_votes.get(p, 0) + (1 if p in body.platforms else 0) for p in item.platforms}
        if note:
            item.note = note
            item.notes = [note, *item.notes][:3]
        item.updated_at = now
        self.db.commit()
        return self.receipt(item)

    def list(self, status=None):
        statement = select(StationWish).where(StationWish.merged_into_id.is_(None)).order_by(StationWish.votes.desc(), StationWish.updated_at.desc(), StationWish.id).limit(300)
        if status:
            statement = statement.where(StationWish.status == status)
        return [WishRead.model_validate(item) for item in self.db.scalars(statement)]

    def update(self, wish_id, body, admin_id):
        item = self.resolve(wish_id)
        before = WishRead.model_validate(item).model_dump(mode="json")
        if body.merge_into_id:
            target = self.resolve(body.merge_into_id)
            if target.id == item.id:
                raise HTTPException(422, "不能合并到自己或已合并的同一条请求")
            target.votes += item.votes
            target.platforms = list(dict.fromkeys([*target.platforms, *item.platforms]))
            target.platform_votes = {p: target.platform_votes.get(p, 0) + item.platform_votes.get(p, 0) for p in target.platforms}
            target.notes = [*item.notes, *target.notes][:3]
            target.updated_at = utcnow()
            item.merged_into_id = target.id
        if body.name:
            item.name = body.name
        software = self.db.get(StationSoftware, body.software_id) if body.software_id else None
        if body.software_id and software is None:
            raise HTTPException(422, "关联的软件不存在，请重新选择")
        if body.status == "added" and not body.software_id:
            raise HTTPException(422, "标记为已收录时，请选择对应的软件")
        if body.status == "added" and software and not software.published:
            raise HTTPException(422, "这款软件尚未上架，请先上架再标记为已收录")
        if body.status:
            item.status = body.status
            item.software_id = body.software_id if body.status == "added" else None
            item.handled_at = None if body.status == "new" else utcnow()
        self.db.flush()
        after = WishRead.model_validate(item)
        CatalogService(self.db).audit(admin_id, "update", "station_wish", item.id, before, after.model_dump(mode="json"))
        self.db.commit()
        return after


class SyncService:
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def clean(code: str) -> str:
        return re.sub(r"[\s-]", "", code).upper()

    def create(self, body):
        ids = list(dict.fromkeys(body.software_ids))
        published = {item.id: item.slug for item in self.db.scalars(select(StationSoftware).where(StationSoftware.id.in_(ids), StationSoftware.published.is_(True)))} if ids else {}
        now = utcnow()
        for _ in range(5):
            code = "".join(secrets.choice(SYNC_ALPHABET) for _ in range(SYNC_LENGTH))
            item = StationSyncCode(code=hashlib.sha256(code.encode()).hexdigest(), software_ids=[published[i] for i in ids if i in published], device=body.device, created_at=now, expires_at=now + timedelta(days=SYNC_DAYS))
            self.db.add(item)
            try:
                if body.previous_code:
                    self.db.execute(delete(StationSyncCode).where(StationSyncCode.code == hashlib.sha256(self.clean(body.previous_code).encode()).hexdigest()))
                self.db.commit()
                return SyncRead(code=code, software_ids=[i for i in ids if i in published], device=item.device, expires_at=item.expires_at)
            except IntegrityError:
                self.db.rollback()
        raise HTTPException(503, "暂时无法生成同步码，请稍后重试")

    def restore(self, code):
        code = self.clean(code)
        if not re.fullmatch(f"[{SYNC_ALPHABET}]{{{SYNC_LENGTH}}}", code):
            raise HTTPException(404, "同步码不对，请检查后重试")
        item = self.db.get(StationSyncCode, hashlib.sha256(code.encode()).hexdigest())
        if item is None or utc_datetime(item.expires_at) <= utcnow():
            raise HTTPException(404, "同步码不存在或已过期，请在原设备上重新生成")
        published = list(self.db.scalars(select(StationSoftware).where((StationSoftware.id.in_(item.software_ids) | StationSoftware.slug.in_(item.software_ids)), StationSoftware.published.is_(True)))) if item.software_ids else []
        return SyncRead(code=code, software_ids=[s.id for s in published], device=item.device, expires_at=item.expires_at)


class StationDashboardService:
    def __init__(self, db: Session):
        self.db = db

    def daily(self, event, since):
        rows = self.db.execute(select(StationStatsDaily.day, func.sum(StationStatsDaily.count)).where(StationStatsDaily.event == event, StationStatsDaily.day >= since).group_by(StationStatsDaily.day))
        return dict(rows.all())

    def read(self, days, settings):
        since = today() - timedelta(days=days - 1)
        previous = since - timedelta(days=days)
        visits, downloads, added = self.daily("page_view", previous), self.daily("dl_copy", previous), self.daily("fav_add", since)
        feedback = dict((day, (ok, issue)) for day, ok, issue in self.db.execute(select(StationFeedbackDaily.day, func.sum(StationFeedbackDaily.ok_count), func.sum(StationFeedbackDaily.issue_count)).where(StationFeedbackDaily.day >= since).group_by(StationFeedbackDaily.day)))
        series = []
        for offset in range(days):
            day = since + timedelta(days=offset)
            ok, issue = feedback.get(day, (0, 0))
            series.append(DailyPoint(date=day, visits=visits.get(day, 0), downloads=downloads.get(day, 0), oks=ok, issues=issue, fav_added=added.get(day, 0)))
        totals = DashboardTotals(
            visits=sum(p.visits for p in series), downloads=sum(p.downloads for p in series), oks=sum(p.oks for p in series), issues=sum(p.issues for p in series), fav_added=sum(p.fav_added for p in series),
            favorites=self.db.scalar(select(func.coalesce(func.sum(StationSoftware.favorite_count), 0)).where(StationSoftware.published.is_(True))) or 0,
            previous_visits=sum(count for day, count in visits.items() if day < since), previous_downloads=sum(count for day, count in downloads.items() if day < since),
        )
        count = lambda model, *conditions: self.db.scalar(select(func.count()).select_from(model).where(*conditions))
        counts = DashboardCounts(software=count(StationSoftware), published_software=count(StationSoftware, StationSoftware.published.is_(True)), draft_releases=count(StationRelease, StationRelease.published.is_(False)), new_issues=count(StationFeedbackIssue, StationFeedbackIssue.status == "new"), new_wishes=count(StationWish, StationWish.status == "new", StationWish.merged_into_id.is_(None)))
        hot = [item for item in FeedbackService(self.db).release_summary(days) if item.pending_issues > 0][:5]
        broken = []
        statement = (select(StationFeedbackIssue.release_id, StationFeedbackIssue.link_id, func.count(), func.max(StationFeedbackIssue.created_at))
                     .where(StationFeedbackIssue.kind == "link", StationFeedbackIssue.status == "new").group_by(StationFeedbackIssue.release_id, StationFeedbackIssue.link_id)
                     .order_by(func.count().desc()).limit(10))
        for release_id, link_id, reports, last in self.db.execute(statement):
            release = self.db.get(StationRelease, release_id)
            software = self.db.get(StationSoftware, release.software_id)
            link = self.db.get(StationReleaseLink, link_id) if link_id else None
            broken.append(BrokenLink(release_id=release_id, link_id=link_id, software_id=software.id, software_name=software.name, version=release.version, platform=release.platform, label=link.label if link else "未指定入口", reports=reports, last_reported_at=last))
        wishes = [WishRead.model_validate(item) for item in self.db.scalars(select(StationWish).where(StationWish.status == "new", StationWish.merged_into_id.is_(None)).order_by(StationWish.votes.desc(), StationWish.updated_at.desc()).limit(5))]
        recent = []
        for release, software in self.db.execute(select(StationRelease, StationSoftware).join(StationSoftware, StationSoftware.id == StationRelease.software_id).order_by(StationRelease.published_at.desc().nulls_first(), StationRelease.created_at.desc()).limit(8)):
            recent.append(RecentRelease(id=release.id, software_id=software.id, software_name=software.name, software_slug=software.slug, version=release.version, platform=release.platform, summary=release.summary, advice=release.advice, published=release.published, published_at=release.published_at, views_7d=release.view_count))
        stats = StatsService(self.db)
        impressions, clicks = stats.totals("ad_imp", days), stats.totals("ad_click", days)
        ads = [AdPlacementStats(placement=placement, enabled=settings.ad_placements.get(placement, True), impressions=sum(v for k, v in impressions.items() if k.startswith(placement + ":")), clicks=sum(v for k, v in clicks.items() if k.startswith(placement + ":"))) for placement in PLACEMENTS]
        promotions = []
        for promotion in self.db.scalars(select(StationPromotion).order_by(StationPromotion.slug)):
            suffix = ":" + promotion.id
            promotions.append(PromotionStats(id=promotion.id, title=promotion.title, impressions=sum(v for k, v in impressions.items() if k.endswith(suffix)), clicks=sum(v for k, v in clicks.items() if k.endswith(suffix))))
        return StationDashboard(days=days, series=series, totals=totals, counts=counts, hot_releases=hot, broken_links=broken, wishes=wishes, recent_releases=recent, ads=ads, promotions=promotions)
