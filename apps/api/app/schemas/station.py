"""Validated station content. Body/notes are plain text; links and images are structured."""
import re
from datetime import date, datetime, timezone
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.catalog import UtcDatetime

Platform = Literal["android", "ios", "tv", "desktop"]
Status = Literal["normal", "attention", "unavailable"]
Category = Literal["video", "netdisk", "tool", "music", "note", "reading", "browser", "other"]
Advice = Literal["recommended", "wait", "hold", "optional"]
Placement = Literal["home_feed", "home_banner", "library_bottom", "detail_body", "announcement_bottom", "desktop_sidebar"]
Slug = Annotated[str, Field(min_length=1, max_length=160, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")]


def safe_url(value: str) -> str:
    if len(value) > 2048 or any(ord(char) < 33 for char in value) or "\\" in value:
        raise ValueError("链接不能包含空格、控制字符或反斜线")
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        _ = parsed.port
    except ValueError as exc:
        raise ValueError("链接格式无效，请填写完整的网址") from exc
    if parsed.scheme.lower() not in {"http", "https"} or not hostname or parsed.username or parsed.password:
        raise ValueError("请填写以 http:// 或 https:// 开头的完整链接")
    return value


def local_image(value: str) -> str:
    if not value or re.fullmatch(r"/uploads/[a-f0-9]{32}\.png", value):
        return value
    raise ValueError("图片请先上传，再使用上传后返回的本站地址")


ImagePath = Annotated[str, AfterValidator(local_image)]
ShortText = Annotated[str, Field(min_length=1, max_length=120)]
Step = Annotated[str, Field(min_length=1, max_length=2000)]


class StationModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, from_attributes=True)


class FAQ(StationModel):
    question: str = Field(min_length=1, max_length=300)
    answer: str = Field(min_length=1, max_length=3000)
    # Empty means the answer applies to every device.
    platforms: list[Platform] = Field(default_factory=list, max_length=4)


class SoftwareWrite(StationModel):
    slug: Slug
    name: str = Field(min_length=1, max_length=120)
    aliases: list[ShortText] = Field(default_factory=list, max_length=30)
    summary: str = Field(default="", max_length=500)
    icon_url: ImagePath = ""
    color: str = Field(default="#245BDD", pattern=r"^#[0-9a-fA-F]{6}$")
    platforms: list[Platform] = Field(default_factory=list, max_length=4)
    status: Status = "normal"
    status_reason: str = Field(default="", max_length=1000)
    installation: list[Step] = Field(default_factory=list, max_length=30)
    faqs: list[FAQ] = Field(default_factory=list, max_length=30)
    screenshots: list[ImagePath] = Field(default_factory=list, max_length=20)
    category: Category = "other"
    description: str = Field(default="", max_length=5000)
    developer: str = Field(default="", max_length=120)
    website_url: str = Field(default="", max_length=2048)
    tags: list[ShortText] = Field(default_factory=list, max_length=20)
    install_guides: dict[Platform, list[Step]] = Field(default_factory=dict)
    install_illustrations: dict[Platform, dict[str, ImagePath]] = Field(default_factory=dict)
    install_tips: dict[Platform, Annotated[str, Field(max_length=1000)]] = Field(default_factory=dict)
    pricing: str = Field(default="", max_length=200)
    listed_at: date | None = None
    published: bool = False
    is_demo: bool = False

    @field_validator("aliases", "platforms", "tags")
    @classmethod
    def unique_values(cls, value):
        return list(dict.fromkeys(value))

    @field_validator("website_url")
    @classmethod
    def optional_website(cls, value):
        return safe_url(value) if value else value

    @field_validator("install_guides")
    @classmethod
    def guide_limits(cls, value):
        if any(len(steps) > 30 for steps in value.values()):
            raise ValueError("每种设备最多填写 30 个安装步骤")
        return {platform: steps for platform, steps in value.items() if steps}

    @field_validator("install_illustrations")
    @classmethod
    def illustration_limits(cls, value):
        if any(not re.fullmatch(r"(?:[0-9]|[12][0-9])", index) for images in value.values() for index in images):
            raise ValueError("步骤配图必须对应第 1 至 30 个安装步骤")
        return value

    @model_validator(mode="after")
    def publication_ready(self):
        if self.published and not self.platforms:
            raise ValueError("发布软件前请至少选择一种支持设备")
        return self


class SoftwareRead(SoftwareWrite):
    id: str
    created_at: UtcDatetime
    favorite_count: int = 0
    view_count: int = 0


class LinkWrite(StationModel):
    id: str | None = Field(default=None, max_length=36)
    label: str = Field(min_length=1, max_length=100)
    url: str = Field(max_length=2048)
    code: str = Field(default="", max_length=100)
    is_primary: bool = False
    kind: Literal["official", "netdisk"] = "official"
    is_active: bool = True
    _url = field_validator("url")(safe_url)


class Change(StationModel):
    kind: Literal["added", "fixed", "improved", "known_issue"]
    text: str = Field(min_length=1, max_length=500)


class ReleaseWrite(StationModel):
    software_id: str = Field(min_length=1, max_length=36)
    platform: Platform
    version: str = Field(min_length=1, max_length=80)
    summary: str = Field(default="", max_length=500)
    notes: str = Field(default="", max_length=30000)
    status: Status = "normal"
    status_reason: str = Field(default="", max_length=1000)
    links: list[LinkWrite] = Field(default_factory=list, max_length=10)
    install_notice: str = Field(default="", max_length=2000)
    advice: Advice = "optional"
    advice_note: str = Field(default="", max_length=500)
    stable_release_id: str | None = Field(default=None, max_length=36)
    changes: list[Change] = Field(default_factory=list, max_length=50)
    release_date: date | None = None
    package_size: str = Field(default="", max_length=40)
    requirements: str = Field(default="", max_length=200)
    published: bool = False
    published_at: UtcDatetime | None = None

    @model_validator(mode="after")
    def valid_links(self):
        if sum(link.is_primary for link in self.links) > 1:
            raise ValueError("一个版本只能设置一个主要获取入口")
        ids = [link.id for link in self.links if link.id]
        if len(ids) != len(set(ids)):
            raise ValueError("获取入口不能重复")
        if self.advice == "hold" and not self.stable_release_id:
            raise ValueError("选择“先别更新”时，请指定推荐的稳定版本")
        if self.advice != "hold":
            self.stable_release_id = None
        return self


class ReleaseRead(ReleaseWrite):
    id: str
    created_at: UtcDatetime
    # Derived for display; never written by clients.
    previous_version: str = ""
    feedback_ok: int = 0
    feedback_issue: int = 0
    view_count: int = 0


class ReleaseBatch(StationModel):
    releases: list[ReleaseWrite] = Field(min_length=1, max_length=4)

    @model_validator(mode="after")
    def same_update(self):
        if len({(r.software_id, r.version) for r in self.releases}) != 1 or len({r.platform for r in self.releases}) != len(self.releases):
            raise ValueError("一次发布请选择同一软件、同一版本号和不同设备")
        return self


class NoticeLink(StationModel):
    label: str = Field(min_length=1, max_length=100)
    url: str = Field(max_length=2048)
    _url = field_validator("url")(safe_url)


class AnnouncementWrite(StationModel):
    slug: Slug
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(default="", max_length=600)
    body: str = Field(default="", max_length=40000)
    category: Literal["group", "usage", "maintenance"] = "group"
    importance: Literal["normal", "important", "urgent"] = "normal"
    pinned: bool = False
    expires_at: UtcDatetime | None = None
    software_ids: list[str] = Field(default_factory=list, max_length=100)
    images: list[ImagePath] = Field(default_factory=list, max_length=20)
    links: list[NoticeLink] = Field(default_factory=list, max_length=20)
    published: bool = False
    published_at: UtcDatetime | None = None
    is_demo: bool = False

    @field_validator("software_ids")
    @classmethod
    def unique_ids(cls, values):
        return list(dict.fromkeys(values))


class AnnouncementRead(AnnouncementWrite):
    id: str
    expired: bool = False
    effective_pinned: bool = False
    view_count: int = 0

    @model_validator(mode="after")
    def effective_state(self):
        self.expired = bool(self.expires_at and self.expires_at <= datetime.now(timezone.utc))
        self.effective_pinned = self.published and self.pinned and not self.expired
        return self


class SettingsWrite(StationModel):
    site_name: str = Field(default="版本喵", min_length=1, max_length=60)
    site_description: str = Field(default="软件更新、安装说明和群公告，都在这里", max_length=300)
    instructions: str = Field(default="请先选择自己的设备，再查看对应版本与安装方法。外部链接打不开时，可以复制链接后在浏览器中打开。", max_length=10000)
    ads_enabled: bool = False
    # Missing placements count as enabled; the master switch still applies.
    ad_placements: dict[Placement, bool] = Field(default_factory=dict)
    footer_note: str = Field(default="", max_length=300)
    icp_number: str = Field(default="", max_length=60)
    notice_tip: str = Field(default="", max_length=300)
    inapp_hint: bool = True
    wechat_inapp_hint: bool = False
    hot_searches: list[ShortText] = Field(default_factory=list, max_length=8)
    about_text: str = Field(default="", max_length=20000)
    privacy_text: str = Field(default="", max_length=20000)
    disclaimer_text: str = Field(default="", max_length=20000)
    admin_nickname: str = Field(default="", max_length=30)
    logo_text: str = Field(default="喵", min_length=1, max_length=4)

    @field_validator("site_name")
    @classmethod
    def brand_length(cls, value):
        if len(value) > (16 if value.isascii() else 8):
            raise ValueError("站名最多 8 个字（英文最多 16 个字符）")
        return value

    def placement_enabled(self, placement):
        return self.ads_enabled and self.ad_placements.get(placement, True)


class PromotionWrite(StationModel):
    slug: Slug
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(default="", max_length=600)
    body: str = Field(default="", max_length=40000)
    cover_url: ImagePath = ""
    action_label: str = Field(default="了解活动", min_length=1, max_length=60)
    target_url: str = Field(default="", max_length=2048)
    starts_at: UtcDatetime | None = None
    ends_at: UtcDatetime | None = None
    published: bool = False
    placements: list[Placement] = Field(default_factory=list, max_length=6)

    @field_validator("target_url")
    @classmethod
    def optional_url(cls, value):
        return safe_url(value) if value else value

    @model_validator(mode="after")
    def valid_schedule(self):
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("结束时间必须晚于开始时间")
        if self.published and not self.target_url:
            raise ValueError("上线前请填写活动目标链接")
        self.placements = list(dict.fromkeys(self.placements))
        return self


class PromotionRead(PromotionWrite):
    id: str


class SoftwareStats(StationModel):
    views_7d: int = 0


class StationStats(StationModel):
    software: dict[str, SoftwareStats] = Field(default_factory=dict)
    hot_software: list[str] = Field(default_factory=list)
    hot_searches: list[str] = Field(default_factory=list)


class StationData(StationModel):
    settings: SettingsWrite
    software: list[SoftwareRead]
    releases: list[ReleaseRead]
    announcements: list[AnnouncementRead]
    promotions: list[PromotionRead]
    stats: StationStats = Field(default_factory=StationStats)


class SoftwareDetail(StationModel):
    software: SoftwareRead
    releases: list[ReleaseRead]
    announcements: list[AnnouncementRead]


# ---- Anonymous visitor input (no accounts, no identifiers) ----

IssueKind = Literal["crash", "install", "download", "login", "link", "other"]
StatEvent = Literal["page_view", "sw_view", "release_view", "dl_copy", "fav_add", "fav_remove", "ad_imp", "ad_click", "ann_view", "search", "search_miss"]


class FeedbackWrite(StationModel):
    release_id: str = Field(min_length=1, max_length=36)
    verdict: Literal["ok", "issue"]
    kind: IssueKind | None = None
    note: str = Field(default="", max_length=300)
    link_id: str | None = Field(default=None, max_length=36)

    @model_validator(mode="after")
    def issue_kind(self):
        if self.verdict == "issue" and not self.kind:
            raise ValueError("请选择遇到的问题类型")
        if self.verdict == "ok":
            self.kind, self.note, self.link_id = None, "", None
        return self


class WishWrite(StationModel):
    name: str = Field(min_length=1, max_length=60)
    platforms: list[Platform] = Field(default_factory=list, max_length=4)
    note: str = Field(default="", max_length=300)


class WishReceipt(StationModel):
    id: str
    votes: int
    status: str
    software_slug: str | None = None


class SyncWrite(StationModel):
    software_ids: list[str] = Field(default_factory=list, max_length=200)
    device: Platform | Literal[""] = ""
    previous_code: str = Field(default="", max_length=14)


class VoteWrite(StationModel):
    release_id: str = Field(min_length=1, max_length=36)
    verdict: Literal["ok", "issue", "none"]
    receipt: str = Field(default="", max_length=1500)
    action: Literal["vote", "details"] = "vote"
    kind: IssueKind | None = None
    note: str = Field(default="", max_length=300)
    channel: Literal["web", "wechat", "xhs"] = "web"


class VoteRead(StationModel):
    receipt: str = ""
    oks: int
    issues: int


class SyncRead(StationModel):
    code: str
    software_ids: list[str]
    device: str
    expires_at: UtcDatetime


class EventWrite(StationModel):
    event: StatEvent
    key: str = Field(min_length=1, max_length=80)


class EventBatch(StationModel):
    events: list[EventWrite] = Field(min_length=1, max_length=30)


# ---- Administration ----

class FeedbackIssueRead(StationModel):
    id: str
    release_id: str
    link_id: str | None
    kind: str
    note: str
    status: str
    created_at: UtcDatetime
    handled_at: UtcDatetime | None
    software_id: str = ""
    software_name: str = ""
    version: str = ""
    platform: str = ""
    link_label: str = ""
    channel: str = "web"


class FeedbackUpdate(StationModel):
    ids: list[str] = Field(min_length=1, max_length=200)
    status: Literal["new", "handled", "ignored"]


class ReleaseFeedback(StationModel):
    release_id: str
    software_id: str
    software_name: str
    version: str
    platform: str
    advice: str
    oks: int = 0
    issues: int = 0
    kinds: dict[str, int] = Field(default_factory=dict)
    pending_issues: int = 0
    pending_kinds: dict[str, int] = Field(default_factory=dict)


class FeedbackList(StationModel):
    items: list[FeedbackIssueRead]
    releases: list[ReleaseFeedback]


class WishRead(StationModel):
    id: str
    name: str
    platforms: list[str]
    votes: int
    note: str
    status: str
    software_id: str | None
    created_at: UtcDatetime
    updated_at: UtcDatetime
    handled_at: UtcDatetime | None
    platform_votes: dict[str, int] = Field(default_factory=dict)
    notes: list[str] = Field(default_factory=list)
    merged_into_id: str | None = None


class WishUpdate(StationModel):
    status: Literal["new", "planned", "added", "rejected"] | None = None
    software_id: str | None = Field(default=None, max_length=36)
    name: str | None = Field(default=None, min_length=2, max_length=60)
    merge_into_id: str | None = Field(default=None, max_length=36)


class DailyPoint(StationModel):
    date: date
    visits: int = 0
    downloads: int = 0
    oks: int = 0
    issues: int = 0
    fav_added: int = 0


class DashboardTotals(StationModel):
    visits: int = 0
    downloads: int = 0
    oks: int = 0
    issues: int = 0
    fav_added: int = 0
    favorites: int = 0
    previous_visits: int = 0
    previous_downloads: int = 0


class DashboardCounts(StationModel):
    software: int = 0
    published_software: int = 0
    draft_releases: int = 0
    new_issues: int = 0
    new_wishes: int = 0


class BrokenLink(StationModel):
    release_id: str
    link_id: str | None
    software_id: str
    software_name: str
    version: str
    platform: str
    label: str
    reports: int
    last_reported_at: UtcDatetime


class RecentRelease(StationModel):
    id: str
    software_id: str
    software_name: str
    software_slug: str
    version: str
    platform: str
    summary: str
    advice: str
    published: bool
    published_at: UtcDatetime | None
    views_7d: int = 0


class AdPlacementStats(StationModel):
    placement: Placement
    enabled: bool
    impressions: int = 0
    clicks: int = 0


class PromotionStats(StationModel):
    id: str
    title: str
    impressions: int = 0
    clicks: int = 0


class StationDashboard(StationModel):
    days: int
    series: list[DailyPoint]
    totals: DashboardTotals
    counts: DashboardCounts
    hot_releases: list[ReleaseFeedback]
    broken_links: list[BrokenLink]
    wishes: list[WishRead]
    recent_releases: list[RecentRelease]
    ads: list[AdPlacementStats]
    promotions: list[PromotionStats]
