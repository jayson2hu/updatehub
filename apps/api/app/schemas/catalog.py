import re
import unicodedata
from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.urls import validate_official_url

Platform = Literal["windows", "macos", "linux", "android", "ios", "web"]
UpdateLevel = Literal["critical", "recommended", "optional", "hold"]
LinkType = Literal["website", "download", "release", "docs", "store"]


def utc_datetime(value: datetime) -> datetime:
    # Stored timestamps are UTC. SQLite drops timezone metadata on retrieval,
    # whereas PostgreSQL retains it; normalize both at the response boundary.
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


UtcDatetime = Annotated[datetime, AfterValidator(utc_datetime)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class CategoryWrite(StrictModel):
    name: str = Field(min_length=1, max_length=80)
    slug: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    sort_order: int = Field(default=0, ge=-10000, le=10000)


class CategoryPatch(CategoryWrite):
    name: str = Field(default="", min_length=1, max_length=80)
    slug: str = Field(default="", min_length=1, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class CategoryRead(CategoryWrite):
    model_config = ConfigDict(from_attributes=True)
    id: str


class OfficialLinkWrite(StrictModel):
    id: str | None = Field(default=None, max_length=36)
    label: str = Field(min_length=1, max_length=100)
    url: str = Field(max_length=2048)
    type: LinkType = "website"
    platform: Platform | None = None
    architecture: Literal["x64", "arm64", "universal", "x86"] | None = None
    is_primary: bool = False
    is_active: bool = True

    _valid_url = field_validator("url")(validate_official_url)


class OfficialLinkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    label: str
    url: str
    type: LinkType
    platform: str | None
    architecture: str | None
    is_primary: bool
    is_active: bool
    last_checked_at: UtcDatetime | None


class SoftwareWrite(StrictModel):
    name: str = Field(min_length=1, max_length=160)
    slug: str = Field(min_length=1, max_length=160, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    short_name: str = Field(default="", max_length=80)
    summary: str = Field(default="", max_length=500)
    description: str = Field(default="", max_length=30000)
    icon_url: str = Field(default="", max_length=2048)
    category_id: str | None = Field(default=None, max_length=36)
    website_url: str = Field(default="", max_length=2048)
    docs_url: str = Field(default="", max_length=2048)
    github_url: str = Field(default="", max_length=2048)
    latest_version: str = Field(default="", max_length=80)
    update_level: UpdateLevel = "optional"
    update_reason: str = Field(default="", max_length=5000)
    published: bool = False
    is_demo: bool = False
    aliases: list[str] = Field(default_factory=list, max_length=50)
    tags: list[str] = Field(default_factory=list, max_length=30)
    purposes: list[str] = Field(default_factory=list, max_length=30)
    platforms: list[Platform] = Field(default_factory=list, max_length=6)
    official_links: list[OfficialLinkWrite] = Field(default_factory=list, max_length=30)
    seo_title: str = Field(default="", max_length=200)
    seo_description: str = Field(default="", max_length=500)

    @field_validator("website_url", "docs_url", "github_url")
    @classmethod
    def valid_optional_url(cls, value):
        return validate_official_url(value) if value else value

    @field_validator("icon_url")
    @classmethod
    def valid_icon(cls, value):
        if not value or re.fullmatch(r"/icons/[a-z0-9-]+\.svg", value) or re.fullmatch(r"/uploads/[a-f0-9]{32}\.png", value):
            return value
        raise ValueError("图标必须使用本站图标或上传后返回的图片地址")

    @field_validator("aliases", "tags", "purposes", "platforms")
    @classmethod
    def clean_lists(cls, values, info):
        result = []
        seen = set()
        for item in values:
            value = item.strip()
            maximum = 120 if info.field_name == "aliases" else 80
            if not value or len(value) > maximum:
                raise ValueError(f"列表项必须为 1–{maximum} 个字符")
            if info.field_name == "aliases" and len(unicodedata.normalize("NFKC", value).casefold()) > 120:
                raise ValueError("别名标准化后不能超过 120 个字符")
            key = value.casefold()
            if key not in seen:
                seen.add(key)
                result.append(value)
        return result

    @model_validator(mode="after")
    def valid_links(self):
        if sum(link.is_primary and link.is_active for link in self.official_links) > 1:
            raise ValueError("仅能设置一个启用的主要官方入口")
        ids = [link.id for link in self.official_links if link.id]
        if len(ids) != len(set(ids)):
            raise ValueError("官方入口 ID 不能重复")
        return self


class SoftwarePatch(SoftwareWrite):
    name: str = Field(default="", min_length=1, max_length=160)
    slug: str = Field(default="", min_length=1, max_length=160, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class SoftwareRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    slug: str
    short_name: str
    summary: str
    description: str
    icon_url: str
    category_id: str | None
    category: CategoryRead | None
    website_url: str
    docs_url: str
    github_url: str
    latest_version: str
    current_release_id: str | None
    update_level: UpdateLevel
    update_reason: str
    published: bool
    is_demo: bool
    aliases: list[str]
    tags: list[str]
    purposes: list[str]
    platforms: list[str]
    official_links: list[OfficialLinkRead]
    seo_title: str
    seo_description: str
    created_at: UtcDatetime
    updated_at: UtcDatetime


class SoftwarePage(BaseModel):
    items: list[SoftwareRead]
    total: int
    page: int
    page_size: int


class AuditRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    admin_user_id: str | None
    action: str
    resource_type: str
    resource_id: str
    payload: dict
    created_at: UtcDatetime


class AuditPage(BaseModel):
    items: list[AuditRead]
    total: int
    page: int
    page_size: int


class OkResponse(BaseModel):
    ok: bool = True


class UploadResponse(BaseModel):
    url: str


class SiteSettingsRead(BaseModel):
    site_name: str
    site_description: str


class HealthRead(BaseModel):
    status: str
