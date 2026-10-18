import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Category(Base):
    __tablename__ = "category"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(80))
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Software(Base):
    __tablename__ = "software"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(160), index=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    short_name: Mapped[str] = mapped_column(String(80), default="")
    summary: Mapped[str] = mapped_column(String(500), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    icon_url: Mapped[str] = mapped_column(String(2048), default="")
    category_id: Mapped[str | None] = mapped_column(ForeignKey("category.id"), nullable=True, index=True)
    website_url: Mapped[str] = mapped_column(String(2048), default="")
    docs_url: Mapped[str] = mapped_column(String(2048), default="")
    github_url: Mapped[str] = mapped_column(String(2048), default="")
    latest_version: Mapped[str] = mapped_column(String(80), default="")
    current_release_id: Mapped[str | None] = mapped_column(ForeignKey("release_update.id", name="fk_software_current_release_id", ondelete="SET NULL", use_alter=True), nullable=True, index=True)
    update_level: Mapped[str] = mapped_column(String(20), default="optional")
    update_reason: Mapped[str] = mapped_column(Text, default="")
    published: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    seo_title: Mapped[str] = mapped_column(String(200), default="")
    seo_description: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    category: Mapped[Category | None] = relationship(lazy="selectin")
    alias_rows: Mapped[list["SoftwareAlias"]] = relationship(cascade="all, delete-orphan", lazy="selectin")
    tag_rows: Mapped[list["SoftwareTag"]] = relationship(cascade="all, delete-orphan", lazy="selectin")
    platform_rows: Mapped[list["SoftwarePlatform"]] = relationship(cascade="all, delete-orphan", lazy="selectin")
    purpose_rows: Mapped[list["SoftwarePurpose"]] = relationship(cascade="all, delete-orphan", lazy="selectin")
    official_links: Mapped[list["OfficialLink"]] = relationship(cascade="all, delete-orphan", lazy="selectin", order_by="OfficialLink.created_at")

    @property
    def aliases(self):
        return [row.alias for row in self.alias_rows]

    @property
    def tags(self):
        return [row.tag for row in self.tag_rows]

    @property
    def platforms(self):
        return [row.platform for row in self.platform_rows]

    @property
    def purposes(self):
        return [row.purpose for row in self.purpose_rows]


class SoftwareAlias(Base):
    __tablename__ = "software_alias"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    software_id: Mapped[str] = mapped_column(ForeignKey("software.id", ondelete="CASCADE"), index=True)
    alias: Mapped[str] = mapped_column(String(120))
    normalized_alias: Mapped[str] = mapped_column(String(120), index=True)


class SoftwareTag(Base):
    __tablename__ = "software_tag"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    software_id: Mapped[str] = mapped_column(ForeignKey("software.id", ondelete="CASCADE"), index=True)
    tag: Mapped[str] = mapped_column(String(80))


class SoftwarePlatform(Base):
    __tablename__ = "software_platform"
    __table_args__ = (UniqueConstraint("software_id", "platform"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    software_id: Mapped[str] = mapped_column(ForeignKey("software.id", ondelete="CASCADE"), index=True)
    platform: Mapped[str] = mapped_column(String(20), index=True)
    architecture: Mapped[str | None] = mapped_column(String(30), nullable=True)


class SoftwarePurpose(Base):
    __tablename__ = "software_purpose"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    software_id: Mapped[str] = mapped_column(ForeignKey("software.id", ondelete="CASCADE"), index=True)
    purpose: Mapped[str] = mapped_column(String(80))


class OfficialLink(Base):
    __tablename__ = "official_link"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    software_id: Mapped[str] = mapped_column(ForeignKey("software.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(100))
    url: Mapped[str] = mapped_column(String(2048))
    type: Mapped[str] = mapped_column(String(20), default="website")
    platform: Mapped[str | None] = mapped_column(String(20), nullable=True)
    architecture: Mapped[str | None] = mapped_column(String(30), nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class AdminUser(Base):
    __tablename__ = "admin_user"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(512))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AdminSession(Base):
    __tablename__ = "admin_session"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    admin_user_id: Mapped[str] = mapped_column(ForeignKey("admin_user.id", ondelete="CASCADE"), index=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    admin: Mapped[AdminUser] = relationship(lazy="joined")


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    admin_user_id: Mapped[str | None] = mapped_column(ForeignKey("admin_user.id"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(50))
    resource_type: Mapped[str] = mapped_column(String(50))
    resource_id: Mapped[str] = mapped_column(String(36))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
