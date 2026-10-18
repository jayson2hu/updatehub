from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.catalog import CategoryRead, Platform, SoftwareRead, StrictModel, UtcDatetime

ContentKind = Literal["guide", "faq", "collection"]
ContentStatus = Literal["draft", "published", "archived"]


class ContentSection(StrictModel):
    title: str = Field(default="", max_length=160)
    body: str = Field(default="", max_length=10000)


class ContentItemWrite(StrictModel):
    id: str | None = Field(default=None, max_length=36)
    software_id: str = Field(min_length=1, max_length=36)
    sort_order: int = Field(default=0, ge=-10000, le=10000)
    importance: Literal["required", "recommended", "optional"] = "recommended"
    note: str = Field(default="", max_length=3000)


class ContentWrite(StrictModel):
    kind: ContentKind
    slug: str = Field(min_length=1, max_length=160, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(default="", max_length=600)
    content: str = Field(default="", max_length=60000)
    sections: list[ContentSection] = Field(default_factory=list, max_length=30)
    software_id: str | None = Field(default=None, max_length=36)
    category_id: str | None = Field(default=None, max_length=36)
    platforms: list[Platform] = Field(default_factory=list, max_length=6)
    purposes: list[str] = Field(default_factory=list, max_length=20)
    status: Literal["draft"] = "draft"
    sort_order: int = Field(default=0, ge=-10000, le=10000)
    is_demo: bool = False
    items: list[ContentItemWrite] = Field(default_factory=list, max_length=100)

    @field_validator("purposes", "platforms")
    @classmethod
    def clean_lists(cls, values):
        cleaned = list(dict.fromkeys(item.strip() for item in values))
        if any(not item or len(item) > 80 for item in cleaned):
            raise ValueError("用途或平台必须为 1–80 个字符")
        return cleaned

    @model_validator(mode="after")
    def unique_items(self):
        software_ids = [item.software_id for item in self.items]
        item_ids = [item.id for item in self.items if item.id]
        if len(software_ids) != len(set(software_ids)) or len(item_ids) != len(set(item_ids)):
            raise ValueError("清单中不能重复添加同一软件或成员 ID")
        return self


class ContentPatch(ContentWrite):
    kind: ContentKind = "guide"
    slug: str = Field(default="", min_length=1, max_length=160, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    title: str = Field(default="", min_length=1, max_length=200)


class ContentItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    software_id: str
    software: SoftwareRead
    sort_order: int
    importance: Literal["required", "recommended", "optional"]
    note: str


class ContentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    kind: ContentKind
    slug: str
    title: str
    summary: str
    content: str
    sections: list[ContentSection]
    software_id: str | None
    software: SoftwareRead | None
    category_id: str | None
    category: CategoryRead | None
    platforms: list[Platform]
    purposes: list[str]
    status: ContentStatus
    sort_order: int
    is_demo: bool
    published_at: UtcDatetime | None
    created_at: UtcDatetime
    updated_at: UtcDatetime
    items: list[ContentItemRead]


class ContentPage(BaseModel):
    items: list[ContentRead]
    total: int
    page: int
    page_size: int


def content_read(item, *, public=False):
    # Filter before serializing so even unpublished member IDs/names never reach
    # the public response. Do not mutate the ORM collection during public reads.
    fields = {name: getattr(item, name) for name in ContentRead.model_fields if name != "items"}
    fields["items"] = [member for member in item.items if not public or member.software.published]
    return ContentRead.model_validate(fields)
