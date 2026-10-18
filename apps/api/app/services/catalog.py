from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from sqlalchemy import select

from app.models import AuditLog, Category, ContentDocument, OfficialLink, Software, SoftwareAlias, SoftwarePlatform, SoftwarePurpose, SoftwareTag
from app.models.entities import utcnow
from app.repositories.catalog import CatalogRepository, normalized
from app.schemas.catalog import CategoryRead, SoftwareRead


class CatalogService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = CatalogRepository(db)

    def audit(self, admin_id: str | None, action: str, kind: str, resource_id: str, before=None, after=None):
        self.db.add(AuditLog(admin_user_id=admin_id, action=action, resource_type=kind, resource_id=resource_id, payload={"before": before, "after": after}))

    def commit(self):
        try:
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(409, "名称标识已存在，或关联数据发生冲突") from exc

    def get(self, software_id: str):
        item = self.repo.by_id(software_id)
        if item is None:
            raise HTTPException(404, "没有找到这款软件")
        return item

    def apply(self, item: Software, data: dict):
        if "category_id" in data and data["category_id"] is not None and self.db.get(Category, data["category_id"]) is None:
            raise HTTPException(422, "选择的分类不存在")
        relation_specs = {
            "aliases": ("alias_rows", SoftwareAlias, "alias"),
            "tags": ("tag_rows", SoftwareTag, "tag"),
            "purposes": ("purpose_rows", SoftwarePurpose, "purpose"),
            "platforms": ("platform_rows", SoftwarePlatform, "platform"),
        }
        for key, (relation, model, column) in relation_specs.items():
            if key not in data:
                continue
            existing = {getattr(row, column): row for row in getattr(item, relation)}
            rows = []
            for value in data.pop(key):
                row = existing.get(value) or model(**{column: value})
                if key == "aliases":
                    row.normalized_alias = normalized(value)
                rows.append(row)
            setattr(item, relation, rows)
        if "official_links" in data:
            old_links = {link.id: link for link in item.official_links}
            links = []
            for value in data.pop("official_links"):
                link_id = value.pop("id", None)
                if link_id and link_id not in old_links:
                    raise HTTPException(422, "官方入口 ID 不属于这款软件")
                link = old_links.get(link_id) or OfficialLink()
                for field, val in value.items():
                    setattr(link, field, val)
                links.append(link)
            item.official_links = links
        for field, val in data.items():
            setattr(item, field, val)
        item.updated_at = utcnow()
        if item.published and not any(link.is_active for link in item.official_links):
            raise HTTPException(422, "发布软件前请至少添加一个启用的官方入口")

    def save(self, payload, admin_id: str | None, software_id: str | None = None):
        item = self.get(software_id) if software_id else Software()
        before = SoftwareRead.model_validate(item).model_dump(mode="json") if software_id else None
        data = payload.model_dump(exclude_unset=bool(software_id))
        self.apply(item, data)
        self.db.add(item)
        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(409, "软件 slug 已存在，或关联数据发生冲突") from exc
        self.db.refresh(item)
        after = SoftwareRead.model_validate(item).model_dump(mode="json")
        self.audit(admin_id, "update" if software_id else "create", "software", item.id, before, after)
        self.commit()
        return item

    def unpublish(self, software_id: str, admin_id: str):
        item = self.get(software_id)
        before = SoftwareRead.model_validate(item).model_dump(mode="json")
        item.published = False
        item.updated_at = utcnow()
        self.audit(admin_id, "unpublish", "software", item.id, before, SoftwareRead.model_validate(item).model_dump(mode="json"))
        self.commit()

    def save_category(self, payload, admin_id: str, category_id: str | None = None):
        item = self.db.get(Category, category_id) if category_id else Category()
        if item is None:
            raise HTTPException(404, "分类不存在")
        before = CategoryRead.model_validate(item).model_dump() if category_id else None
        for field, value in payload.model_dump(exclude_unset=bool(category_id)).items():
            setattr(item, field, value)
        self.db.add(item)
        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(409, "分类 slug 已存在") from exc
        self.audit(admin_id, "update" if category_id else "create", "category", item.id, before, CategoryRead.model_validate(item).model_dump())
        self.commit()
        return item

    def delete_category(self, category_id: str, admin_id: str):
        item = self.db.get(Category, category_id)
        if item is None:
            raise HTTPException(404, "分类不存在")
        if self.repo.category_used(category_id) or self.db.scalar(select(ContentDocument.id).where(ContentDocument.category_id == category_id).limit(1)):
            raise HTTPException(409, "该分类仍被软件或内容使用，请先更改关联分类")
        self.audit(admin_id, "delete", "category", item.id, CategoryRead.model_validate(item).model_dump(), None)
        self.db.delete(item)
        self.commit()
