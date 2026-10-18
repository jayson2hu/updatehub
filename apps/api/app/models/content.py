from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.entities import Category, Software, new_id, utcnow


class ContentDocument(Base):
    __tablename__ = "content_document"
    __table_args__ = (Index("ix_content_document_kind_status", "kind", "status"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    kind: Mapped[str] = mapped_column(String(20))
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(String(600), default="")
    content: Mapped[str] = mapped_column(Text, default="")
    sections: Mapped[list] = mapped_column(JSON, default=list)
    software_id: Mapped[str | None] = mapped_column(ForeignKey("software.id"), nullable=True, index=True)
    category_id: Mapped[str | None] = mapped_column(ForeignKey("category.id"), nullable=True, index=True)
    platforms: Mapped[list] = mapped_column(JSON, default=list)
    purposes: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    software: Mapped[Software | None] = relationship(lazy="selectin")
    category: Mapped[Category | None] = relationship(lazy="selectin")
    items: Mapped[list["ContentItem"]] = relationship(cascade="all, delete-orphan", lazy="selectin", order_by="(ContentItem.sort_order, ContentItem.id)")


class ContentItem(Base):
    __tablename__ = "content_item"
    __table_args__ = (UniqueConstraint("document_id", "software_id", name="uq_content_item_document_software"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    document_id: Mapped[str] = mapped_column(ForeignKey("content_document.id", ondelete="CASCADE"), index=True)
    software_id: Mapped[str] = mapped_column(ForeignKey("software.id"), index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    importance: Mapped[str] = mapped_column(String(20), default="recommended")
    note: Mapped[str] = mapped_column(Text, default="")
    software: Mapped[Software] = relationship(lazy="selectin")


class AnalyticsDaily(Base):
    """Daily counters only: no request, person, network or session identifiers."""
    __tablename__ = "analytics_daily"
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    event: Mapped[str] = mapped_column(String(20), primary_key=True)
    scope: Mapped[str] = mapped_column(String(20), primary_key=True)
    key: Mapped[str] = mapped_column(String(160), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)
    no_result_count: Mapped[int] = mapped_column(Integer, default=0)
    software_id: Mapped[str | None] = mapped_column(ForeignKey("software.id", ondelete="SET NULL"), nullable=True)
    official_link_id: Mapped[str | None] = mapped_column(ForeignKey("official_link.id", ondelete="SET NULL"), nullable=True)
