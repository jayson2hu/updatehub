from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Category, ContentDocument, ContentItem, Software
from app.models.entities import utcnow
from app.repositories.content import ContentRepository
from app.schemas.content import content_read
from app.services.catalog import CatalogService


class ContentService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = ContentRepository(db)
        self.catalog = CatalogService(db)

    def get(self, document_id, *, lock=False):
        item = self.repo.by_id(document_id, lock=lock)
        if item is None:
            raise HTTPException(404, "内容不存在")
        return item

    @staticmethod
    def snapshot(item):
        return content_read(item).model_dump(mode="json")

    @staticmethod
    def validate_shape(item):
        if item.kind != "collection" and item.items:
            raise HTTPException(422, "只有清单可以添加软件成员")
        if item.kind == "collection" and item.software_id:
            raise HTTPException(422, "清单请通过成员列表关联软件")
        if item.kind != "guide" and item.sections:
            raise HTTPException(422, "只有指南可以添加步骤；常见问题使用正文作为答案")

    def validate_publish(self, item):
        self.validate_shape(item)
        if item.software_id and not item.software.published:
            raise HTTPException(422, "关联软件尚未发布，请先发布软件")
        if not item.is_demo and ((item.software is not None and item.software.is_demo) or any(member.software.is_demo for member in item.items)):
            raise HTTPException(422, "关联演示软件的内容必须标为演示内容")
        if item.kind == "faq" and not item.content.strip():
            raise HTTPException(422, "发布常见问题前请填写答案")
        if item.kind == "guide" and (not item.summary.strip() or not (item.content.strip() or item.sections)):
            raise HTTPException(422, "发布指南前请填写摘要以及正文或操作步骤")
        if item.kind == "guide" and any(not section["title"].strip() or not section["body"].strip() for section in item.sections):
            raise HTTPException(422, "发布指南前请补全每个步骤的标题和说明")
        if item.kind == "collection":
            if not item.summary.strip() or not item.items:
                raise HTTPException(422, "发布清单前请填写摘要并添加软件")
            if any(not member.software.published for member in item.items):
                raise HTTPException(422, "清单成员必须全部为已发布软件")

    def save(self, payload, admin_id, document_id=None):
        item = self.get(document_id, lock=True) if document_id else ContentDocument()
        if document_id and item.status != "draft":
            raise HTTPException(409, "请先下线为草稿，再编辑并重新确认发布")
        before = self.snapshot(item) if document_id else None
        data = payload.model_dump(exclude_unset=bool(document_id))
        # PATCH omission applies to document fields. A supplied ordered list
        # replaces that list, so nested defaults still need to be materialized.
        if "items" in data:
            data["items"] = [member.model_dump() for member in payload.items]
        if "sections" in data:
            data["sections"] = [section.model_dump() for section in payload.sections]
        if document_id and "kind" in data and data["kind"] != item.kind:
            raise HTTPException(422, "创建后不能更改内容类型，请新建对应类型")
        for key, model, relation in (("software_id", Software, "software"), ("category_id", Category, "category")):
            if key in data:
                linked = self.db.get(model, data[key]) if data[key] else None
                if data[key] and linked is None:
                    raise HTTPException(422, "关联的软件或分类不存在")
                setattr(item, relation, linked)
        if "items" in data:
            current = {member.id: member for member in item.items}
            by_software = {member.software_id: member for member in item.items}
            members = []
            for position, values in enumerate(sorted(data.pop("items"), key=lambda row: row["sort_order"])):
                member_id = values.pop("id", None)
                if member_id and member_id not in current:
                    raise HTTPException(422, "成员 ID 不属于这份清单")
                member = current.get(member_id) if member_id else by_software.get(values["software_id"])
                if member is not None and member.software_id != values["software_id"]:
                    raise HTTPException(422, "成员 ID 不能转移到其他软件，请删除后重新添加")
                software = self.db.get(Software, values["software_id"])
                if software is None:
                    raise HTTPException(422, "清单成员软件不存在")
                member = member or ContentItem()
                for field, value in values.items():
                    setattr(member, field, value)
                # Contiguous positions make ties stable without relying on UUIDs.
                member.sort_order = position
                member.software = software
                members.append(member)
            item.items = members
        for field, value in data.items():
            setattr(item, field, value)
        item.updated_at = utcnow()
        self.validate_shape(item)
        self.db.add(item)
        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(409, "内容 slug 已存在，或关联数据发生冲突") from exc
        self.db.refresh(item)
        self.catalog.audit(admin_id, "update" if document_id else "create", "content", item.id, before, self.snapshot(item))
        self.catalog.commit()
        return item

    def transition(self, document_id, admin_id, status):
        item = self.get(document_id, lock=True)
        before = self.snapshot(item)
        if status == "published":
            self.validate_publish(item)
            item.published_at = item.published_at or utcnow()
        item.status = status
        item.updated_at = utcnow()
        action = {"published": "publish", "draft": "unpublish", "archived": "archive"}[status]
        self.catalog.audit(admin_id, action, "content", item.id, before, self.snapshot(item))
        self.catalog.commit()
        return item
