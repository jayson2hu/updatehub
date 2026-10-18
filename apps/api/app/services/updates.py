import re

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.urls import validate_official_url
from app.models import ReleaseUpdate, Software
from app.models.entities import utcnow
from app.repositories.updates import UpdateRepository
from app.schemas.catalog import SoftwareRead
from app.schemas.updates import UpdateRead
from app.services.catalog import CatalogService


class UpdateService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = UpdateRepository(db)
        self.catalog = CatalogService(db)

    def get(self, update_id: str, lock=False):
        item = self.repo.by_id(update_id, lock=lock)
        if item is None:
            raise HTTPException(404, "没有找到这条公告")
        return item

    @staticmethod
    def snapshot(item):
        return UpdateRead.model_validate(item).model_dump(mode="json")

    def associated_software(self, item, lock=False):
        if not item.software_id:
            return None
        statement = select(Software).where(Software.id == item.software_id)
        if lock:
            statement = statement.with_for_update().execution_options(populate_existing=True)
        software = self.db.scalar(statement)
        if software is None:
            raise HTTPException(422, "关联的软件不存在")
        return software

    def validate_publication(self, item, software):
        if item.is_historical:
            if item.kind != "release":
                raise HTTPException(422, "历史补录必须选择版本更新类型")
            if item.official_release_date is None:
                raise HTTPException(422, "历史补录发布前必须填写实际官方发布日期")
        fields = [("title", "标题"), ("summary", "摘要"), ("content", "正文"), ("reason_to_update", "行动建议"), ("who_should_update", "影响范围")]
        for field, label in fields:
            if not (getattr(item, field) or "").strip():
                raise HTTPException(422, f"发布公告前请填写{label}")
        if software is not None and not software.published:
            raise HTTPException(422, "关联软件尚未公开，请先发布软件资料")
        if item.official_release_url:
            try:
                validate_official_url(item.official_release_url)
            except ValueError as exc:
                raise HTTPException(422, "官方来源地址需要重新核验") from exc
        if item.kind == "release":
            if software is None:
                raise HTTPException(422, "版本更新必须关联已公开的软件")
            if not item.version.strip():
                raise HTTPException(422, "版本更新必须填写新版本")
            if not item.official_release_url:
                valid_source = False
                for link in software.official_links:
                    if link.is_active:
                        try:
                            validate_official_url(link.url)
                            valid_source = True
                            break
                        except ValueError:
                            continue
                if not valid_source:
                    raise HTTPException(422, "版本更新需要有效的官方来源或启用的官方入口")

    def synchronize_version(self, item, software, admin_id, previous=None):
        if item.kind != "release" or item.status != "published" or software is None or item.is_historical:
            return
        if item.is_demo and not software.is_demo:
            return  # Demonstrations must never replace real software facts.
        if previous is not None and (
            software.current_release_id != item.id
            or software.latest_version != previous["version"]
            or software.is_demo != previous["is_demo"]
            or software.update_level != previous["update_level"]
            or software.update_reason != previous["reason_to_update"]
        ):
            # Editing prose cannot reclaim facts changed independently by an
            # administrator. Only explicit publication may establish provenance.
            return
        self.db.flush()
        authority = self.repo.latest_version_authority(software.id, include_demo=item.is_demo and software.is_demo)
        if authority is None or authority.id != item.id:
            return
        before = SoftwareRead.model_validate(software).model_dump(mode="json")
        software.latest_version = item.version
        software.current_release_id = item.id
        software.update_level = item.update_level
        software.update_reason = item.reason_to_update
        software.is_demo = item.is_demo
        software.updated_at = utcnow()
        after = SoftwareRead.model_validate(software).model_dump(mode="json")
        self.catalog.audit(admin_id, "sync_version", "software", software.id, before, after)

    def save(self, payload, admin_id: str | None, update_id: str | None = None):
        item = self.get(update_id, lock=True) if update_id else ReleaseUpdate()
        before = self.snapshot(item) if update_id else None
        values = payload.model_dump(exclude_unset=bool(update_id))
        old_status = item.status if update_id else "draft"
        requested_status = values.get("status", old_status)
        if requested_status != old_status and requested_status in {"published", "archived"}:
            raise HTTPException(409, "请使用人工发布或归档操作更改公告状态")
        if old_status in {"published", "archived"} and requested_status != old_status:
            raise HTTPException(409, "已发布或归档公告请使用发布和归档操作")
        if not update_id and requested_status not in {"draft", "review"}:
            raise HTTPException(409, "新公告应先保存为草稿或待审核")
        if update_id and item.published_at is not None:
            for field in ("software_id", "kind", "official_release_date", "is_demo", "is_historical"):
                if field in values and values[field] != getattr(item, field):
                    raise HTTPException(409, "公告首次发布后不能更改类型、关联软件、版本发布日期、演示标识或历史补录属性；请新建公告")
        for field, value in values.items():
            setattr(item, field, value)
        item.updated_at = utcnow()
        # Avoid autoflush of partially valid input before meaningful validation errors.
        with self.db.no_autoflush:
            software = self.associated_software(item, lock=item.status == "published")
            if item.status == "published":
                self.validate_publication(item, software)
        self.db.add(item)
        try:
            self.db.flush()
            self.synchronize_version(item, software, admin_id, previous=before)
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(409, "公告 slug 已存在，或关联数据发生冲突") from exc
        self.db.refresh(item)
        self.catalog.audit(admin_id, "update" if update_id else "create", "release_update", item.id, before, self.snapshot(item))
        self.catalog.commit()
        return item

    def publish(self, update_id: str, admin_id: str | None):
        item = self.get(update_id, lock=True)
        before = self.snapshot(item)
        software = self.associated_software(item, lock=True)
        self.validate_publication(item, software)
        item.status = "published"
        if item.published_at is None:
            item.published_at = utcnow()
        item.updated_at = utcnow()
        self.db.flush()
        self.synchronize_version(item, software, admin_id)
        self.db.flush()
        self.db.refresh(item)
        self.catalog.audit(admin_id, "publish", "release_update", item.id, before, self.snapshot(item))
        self.catalog.commit()
        return item

    def archive(self, update_id: str, admin_id: str):
        item = self.get(update_id, lock=True)
        before = self.snapshot(item)
        item.status = "archived"
        item.updated_at = utcnow()
        # Archiving removes the notice, not the fact that a version was released.
        self.db.flush()
        self.catalog.audit(admin_id, "archive", "release_update", item.id, before, self.snapshot(item))
        self.catalog.commit()
        return item

    def notification(self, update_id: str, format: str):
        item = self.get(update_id)
        if item.status != "published" or (item.software is not None and not item.software.published):
            raise HTTPException(409, "仅已公开的公告可以生成群通知")
        labels = {"critical": "建议尽快处理", "recommended": "推荐处理", "optional": "按需处理", "hold": "建议暂缓"}
        kind_labels = {"release": "版本更新", "notice": "使用提醒", "maintenance": "维护通知"}
        lines = [f"{'[演示公告，请勿作为真实通知转发] ' if item.is_demo else ''}{item.title}", f"类型：{kind_labels[item.kind]} · {labels[item.update_level]}"]
        if item.software:
            lines.append(f"关联软件：{item.software.name}")
        if item.kind == "release":
            lines.append(f"版本：{item.previous_version + ' → ' if item.previous_version else ''}{item.version}")
        lines += ["", item.summary]
        if item.changes:
            lines += ["", "主要变化："] + [f"• {change}" for change in item.changes[:8]]
            if len(item.changes) > 8:
                lines.append("更多变化请查看完整公告。")
        lines += ["", f"影响范围：{item.who_should_update}", f"建议行动：{item.reason_to_update}"]
        if item.known_issues:
            lines.append(f"注意事项：{item.known_issues}")
        if item.notes:
            lines.append(f"补充说明：{item.notes}")
        if item.is_historical:
            lines.insert(0, "历史版本记录 · 非当前更新建议")
        url = f"{get_settings().public_site_url.rstrip('/')}/update/{item.slug}"
        if format == "markdown":
            lines = [re.sub(r"([\\`*_{}\[\]()#+.!<>|~-])", r"\\\1", line) for line in lines]
            lines[0] = f"**{lines[0]}**"
            lines += ["", f"[查看完整公告]({url})"]
        else:
            lines += ["", f"查看完整公告：{url}"]
        return "\n".join(lines)
