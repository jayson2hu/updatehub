from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.urls import validate_official_url
from app.schemas.catalog import SoftwareRead, StrictModel, UpdateLevel, UtcDatetime

UpdateKind = Literal["release", "notice", "maintenance"]
UpdateStatus = Literal["draft", "review", "published", "archived"]


class UpdateWrite(StrictModel):
    slug: str = Field(min_length=1, max_length=160, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(default="", max_length=1000)
    content: str = Field(default="", max_length=50000)
    kind: UpdateKind = "release"
    software_id: str | None = Field(default=None, max_length=36)
    version: str = Field(default="", max_length=80)
    previous_version: str = Field(default="", max_length=80)
    update_level: UpdateLevel = "optional"
    changes: list[str] = Field(default_factory=list, max_length=100)
    reason_to_update: str = Field(default="", max_length=10000)
    who_should_update: str = Field(default="", max_length=10000)
    who_can_wait: str = Field(default="", max_length=10000)
    known_issues: str = Field(default="", max_length=10000)
    notes: str = Field(default="", max_length=10000)
    official_release_url: str | None = Field(default=None, max_length=2048)
    official_release_date: date | None = None
    status: UpdateStatus = "draft"
    is_pinned: bool = False
    is_demo: bool = False
    is_historical: bool = False

    @field_validator("official_release_url")
    @classmethod
    def validate_source(cls, value):
        return validate_official_url(value) if value else None

    @field_validator("changes")
    @classmethod
    def validate_changes(cls, values):
        cleaned = [value.strip() for value in values]
        if any(not value or len(value) > 2000 for value in cleaned):
            raise ValueError("每条变化说明必须为 1–2000 个字符")
        return cleaned


class UpdatePatch(UpdateWrite):
    slug: str = Field(default="", min_length=1, max_length=160, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    title: str = Field(default="", min_length=1, max_length=200)


class UpdateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    slug: str
    title: str
    summary: str
    content: str
    kind: UpdateKind
    software_id: str | None
    software: SoftwareRead | None
    version: str
    previous_version: str
    update_level: UpdateLevel
    changes: list[str]
    reason_to_update: str
    who_should_update: str
    who_can_wait: str
    known_issues: str
    notes: str
    official_release_url: str | None
    official_release_date: date | None
    status: UpdateStatus
    is_pinned: bool
    is_demo: bool
    is_historical: bool
    published_at: UtcDatetime | None
    created_at: UtcDatetime
    updated_at: UtcDatetime


class UpdatePage(BaseModel):
    items: list[UpdateRead]
    total: int
    page: int
    page_size: int


class PublishConfirmation(StrictModel):
    confirmed: Literal[True]


class NotificationRead(BaseModel):
    text: str
