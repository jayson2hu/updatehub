"""The community update station. Kept separate from the legacy catalog."""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.entities import new_id, utcnow


class StationSoftware(Base):
    __tablename__ = "station_software"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    aliases: Mapped[list] = mapped_column(JSON, default=list)
    summary: Mapped[str] = mapped_column(String(500), default="")
    icon_url: Mapped[str] = mapped_column(String(2048), default="")
    color: Mapped[str] = mapped_column(String(7), default="#245BDD")
    platforms: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="normal")
    status_reason: Mapped[str] = mapped_column(String(1000), default="")
    installation: Mapped[list] = mapped_column(JSON, default=list)
    faqs: Mapped[list] = mapped_column(JSON, default=list)
    screenshots: Mapped[list] = mapped_column(JSON, default=list)
    published: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class StationRelease(Base):
    __tablename__ = "station_release"
    __table_args__ = (Index("ix_station_release_software_platform_date", "software_id", "platform", "published_at"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    software_id: Mapped[str] = mapped_column(ForeignKey("station_software.id", ondelete="CASCADE"))
    platform: Mapped[str] = mapped_column(String(20))
    version: Mapped[str] = mapped_column(String(80))
    summary: Mapped[str] = mapped_column(String(500), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="normal")
    status_reason: Mapped[str] = mapped_column(String(1000), default="")
    install_notice: Mapped[str] = mapped_column(String(2000), default="")
    published: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    links: Mapped[list["StationReleaseLink"]] = relationship(cascade="all, delete-orphan", lazy="selectin", order_by="StationReleaseLink.sort_order")


class StationReleaseLink(Base):
    """Download destinations are never shared with promotion destinations."""
    __tablename__ = "station_release_link"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    release_id: Mapped[str] = mapped_column(ForeignKey("station_release.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(100))
    url: Mapped[str] = mapped_column(String(2048))
    code: Mapped[str] = mapped_column(String(100), default="")
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class StationAnnouncement(Base):
    __tablename__ = "station_announcement"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(String(600), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(20), default="group")
    importance: Mapped[str] = mapped_column(String(20), default="normal")
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    images: Mapped[list] = mapped_column(JSON, default=list)
    links: Mapped[list] = mapped_column(JSON, default=list)
    published: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    associations: Mapped[list["StationAnnouncementSoftware"]] = relationship(cascade="all, delete-orphan", lazy="selectin")

    @property
    def software_ids(self):
        return [association.software_id for association in self.associations]


class StationAnnouncementSoftware(Base):
    __tablename__ = "station_announcement_software"
    __table_args__ = (UniqueConstraint("announcement_id", "software_id", name="uq_station_notice_software"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    announcement_id: Mapped[str] = mapped_column(ForeignKey("station_announcement.id", ondelete="CASCADE"), index=True)
    software_id: Mapped[str] = mapped_column(ForeignKey("station_software.id", ondelete="CASCADE"), index=True)


class StationSettings(Base):
    __tablename__ = "station_settings"
    id: Mapped[str] = mapped_column(String(20), primary_key=True, default="site")
    site_name: Mapped[str] = mapped_column(String(60), default="更新小站")
    site_description: Mapped[str] = mapped_column(String(300), default="软件更新、安装说明和群公告，都在这里")
    instructions: Mapped[str] = mapped_column(Text, default="请先选择自己的设备，再查看对应版本与安装方法。外部链接打不开时，可以复制链接后在浏览器中打开。")
    ads_enabled: Mapped[bool] = mapped_column(Boolean, default=False)


class StationPromotion(Base):
    __tablename__ = "station_promotion"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(String(600), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    cover_url: Mapped[str] = mapped_column(String(2048), default="")
    action_label: Mapped[str] = mapped_column(String(60), default="了解活动")
    target_url: Mapped[str] = mapped_column(String(2048), default="")
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published: Mapped[bool] = mapped_column(Boolean, default=False)
    placements: Mapped[list] = mapped_column(JSON, default=list)
