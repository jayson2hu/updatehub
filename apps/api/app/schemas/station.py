"""Validated station content. Body/notes are plain text; links and images are structured."""
import re
from datetime import datetime, timezone
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.catalog import UtcDatetime

Platform = Literal["android", "ios", "tv", "desktop"]
Status = Literal["normal", "attention", "unavailable"]
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
    published: bool = False
    is_demo: bool = False

    @field_validator("aliases", "platforms")
    @classmethod
    def unique_values(cls, value):
        return list(dict.fromkeys(value))

    @model_validator(mode="after")
    def publication_ready(self):
        if self.published and not self.platforms:
            raise ValueError("发布软件前请至少选择一种支持设备")
        return self


class SoftwareRead(SoftwareWrite):
    id: str


class LinkWrite(StationModel):
    id: str | None = Field(default=None, max_length=36)
    label: str = Field(min_length=1, max_length=100)
    url: str = Field(max_length=2048)
    code: str = Field(default="", max_length=100)
    is_primary: bool = False
    _url = field_validator("url")(safe_url)


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
    published: bool = False
    published_at: UtcDatetime | None = None

    @model_validator(mode="after")
    def valid_links(self):
        if sum(link.is_primary for link in self.links) > 1:
            raise ValueError("一个版本只能设置一个主要获取入口")
        ids = [link.id for link in self.links if link.id]
        if len(ids) != len(set(ids)):
            raise ValueError("获取入口不能重复")
        return self


class ReleaseRead(ReleaseWrite):
    id: str
    created_at: UtcDatetime


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

    @model_validator(mode="after")
    def effective_state(self):
        self.expired = bool(self.expires_at and self.expires_at <= datetime.now(timezone.utc))
        self.effective_pinned = self.published and self.pinned and not self.expired
        return self


class SettingsWrite(StationModel):
    site_name: str = Field(default="更新小站", min_length=1, max_length=60)
    site_description: str = Field(default="软件更新、安装说明和群公告，都在这里", max_length=300)
    instructions: str = Field(default="请先选择自己的设备，再查看对应版本与安装方法。外部链接打不开时，可以复制链接后在浏览器中打开。", max_length=10000)
    ads_enabled: bool = False


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
    placements: list[Literal["home_feed", "detail_body", "desktop_sidebar"]] = Field(default_factory=list, max_length=3)

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


class StationData(StationModel):
    settings: SettingsWrite
    software: list[SoftwareRead]
    releases: list[ReleaseRead]
    announcements: list[AnnouncementRead]
    promotions: list[PromotionRead]


class SoftwareDetail(StationModel):
    software: SoftwareRead
    releases: list[ReleaseRead]
    announcements: list[AnnouncementRead]
