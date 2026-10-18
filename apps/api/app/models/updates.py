from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, JSON, String, Text, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.entities import Software, new_id, utcnow


class ReleaseUpdate(Base):
    __tablename__ = "release_update"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(String(1000), default="")
    content: Mapped[str] = mapped_column(Text, default="")
    kind: Mapped[str] = mapped_column(String(20), default="release", index=True)
    software_id: Mapped[str | None] = mapped_column(ForeignKey("software.id"), nullable=True, index=True)
    version: Mapped[str] = mapped_column(String(80), default="")
    previous_version: Mapped[str] = mapped_column(String(80), default="")
    update_level: Mapped[str] = mapped_column(String(20), default="optional")
    changes: Mapped[list] = mapped_column(JSON, default=list)
    reason_to_update: Mapped[str] = mapped_column(Text, default="")
    who_should_update: Mapped[str] = mapped_column(Text, default="")
    who_can_wait: Mapped[str] = mapped_column(Text, default="")
    known_issues: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    official_release_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    official_release_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    is_historical: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false(), index=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    software: Mapped[Software | None] = relationship(lazy="selectin", foreign_keys=[software_id])
