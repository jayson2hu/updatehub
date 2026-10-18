from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.catalog import AuditRead, StrictModel
from app.schemas.content import ContentRead
from app.schemas.updates import UpdateRead


class SearchEvent(StrictModel):
    event: Literal["search"]
    query: str = Field(min_length=1, max_length=160)
    result_count: int = Field(ge=0, le=1000000)
    scope: Literal["software", "updates", "guides", "faq", "collections"] = "software"


class DailyCount(BaseModel):
    date: date
    searches: int = 0
    no_result_searches: int = 0
    official_clicks: int = 0


class SearchCount(BaseModel):
    query: str
    scope: str
    searches: int
    no_result_searches: int


class SoftwareClickCount(BaseModel):
    software_id: str
    name: str
    slug: str
    clicks: int


class LinkClickCount(BaseModel):
    official_link_id: str
    software_id: str
    label: str
    clicks: int


class AnalyticsRead(BaseModel):
    searches: int
    no_result_searches: int
    official_clicks: int
    daily: list[DailyCount]
    top_searches: list[SearchCount]
    top_no_result_searches: list[SearchCount]
    top_software: list[SoftwareClickCount]
    top_links: list[LinkClickCount]


class DashboardTotals(BaseModel):
    software: int
    published_software: int
    updates: int
    published_updates: int
    guides: int
    faq: int
    collections: int
    published_content: int
    pending_content: int
    pending_updates: int


class SoftwareGap(BaseModel):
    software_id: str
    name: str
    slug: str
    missing: list[Literal["official_link", "version", "guide", "faq"]]


class DashboardRead(BaseModel):
    days: int
    totals: DashboardTotals
    analytics: AnalyticsRead
    pending_content: list[ContentRead]
    pending_updates: list[UpdateRead]
    gaps: list[SoftwareGap]
    recent_actions: list[AuditRead]
