import io
import logging
import uuid
import warnings
from urllib.parse import urlsplit

from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import ValidationError
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.entities import utcnow
from app.models.station import StationAnnouncement, StationAnnouncementSoftware, StationFeedbackIssue, StationPromotion, StationRelease, StationReleaseLink, StationSettings, StationSoftware
from app.schemas.catalog import utc_datetime
from app.schemas.station import AnnouncementRead, AnnouncementWrite, PromotionRead, PromotionWrite, ReleaseRead, ReleaseWrite, SettingsWrite, SoftwareRead, SoftwareWrite, StationData
from app.services.catalog import CatalogService
from app.services.station_engagement import StatsService, enrich_releases

logger = logging.getLogger("updatehub.station")


def public_releases(releases, software):
    demos = {s.id for s in software if s.is_demo}
    for release in releases:
        if release.software_id in demos:
            # Placeholder hosts are examples, never usable download buttons.
            release.links = [link for link in release.links if not any((urlsplit(link.url).hostname or "").lower() == domain or (urlsplit(link.url).hostname or "").lower().endswith("." + domain) for domain in ("example.com", "example.org", "example.net", "invalid", "test")) and not ("apps.apple.com" in link.url and "/id000" in link.url)]
    return releases

FIELD_LABELS = {
    "slug": "分享链接标识", "name": "软件名称", "aliases": "常用别名", "summary": "一句话说明",
    "icon_url": "软件图标", "color": "图标颜色", "platforms": "支持设备", "platform": "对应设备",
    "status": "使用状态", "status_reason": "状态说明", "installation": "安装步骤", "faqs": "常见问题",
    "question": "问题", "answer": "回答", "screenshots": "软件截图", "published": "发布状态",
    "is_demo": "示例标记", "software_id": "对应软件", "version": "版本号", "notes": "详细更新说明",
    "links": "获取或相关入口", "label": "来源名称", "url": "链接地址", "code": "提取码",
    "is_primary": "主要入口", "install_notice": "安装提醒", "published_at": "发布时间",
    "title": "公告标题", "body": "正文", "category": "公告分类", "importance": "重要程度",
    "pinned": "置顶状态", "expires_at": "到期时间", "software_ids": "关联软件", "images": "配图",
    "site_name": "站点名称", "site_description": "站点简介", "instructions": "基础使用说明",
    "install_illustrations": "安装步骤配图", "install_tips": "安装提示", "pricing": "收费说明", "listed_at": "收录日期", "ads_enabled": "推广功能开关", "id": "内容标识", "created_at": "创建时间",
    "cover_url": "推广封面", "action_label": "活动按钮文字", "target_url": "活动目标链接",
    "placements": "展示位置", "starts_at": "开始时间", "ends_at": "结束时间",
    "category": "软件分类", "description": "详细简介", "developer": "开发者", "website_url": "官网",
    "tags": "标签", "install_guides": "分设备安装步骤", "kind": "类型", "is_active": "入口有效",
    "advice": "更新建议", "advice_note": "建议说明", "stable_release_id": "推荐稳定版",
    "changes": "更新内容", "text": "内容", "release_date": "官方发布日期", "package_size": "安装包大小",
    "requirements": "系统要求", "ad_placements": "广告位开关", "footer_note": "页脚说明",
    "icp_number": "备案号", "notice_tip": "群通知末尾提示", "inapp_hint": "应用内打开提示",
    "verdict": "反馈结果", "note": "补充说明", "link_id": "反馈入口", "release_id": "对应版本",
    "events": "统计事件", "event": "事件类型", "key": "事件内容", "software_ids": "软件",
    "device": "常用设备", "ids": "所选记录", "hot_searches": "热门搜索词", "about_text": "关于本站",
    "privacy_text": "隐私说明", "disclaimer_text": "免责声明", "admin_nickname": "管理员昵称",
}


def validation_message(error: dict) -> str:
    location = ""
    for part in error["loc"]:
        if isinstance(part, int):
            location += f"第 {part + 1} 项"
        else:
            label = FIELD_LABELS.get(part, "其他内容")
            location += ("的" if location else "") + label
    location = location or "表单"
    kind = error["type"]
    context = error.get("ctx", {})
    if kind == "value_error":
        explanation = error["msg"].removeprefix("Value error, ")
    elif kind == "missing":
        explanation = "请填写此项后重试"
    elif kind == "extra_forbidden":
        explanation = "此项不支持直接修改，请刷新页面后重试"
    elif kind == "string_too_short":
        explanation = f"至少填写 {context.get('min_length', 1)} 个字符"
    elif kind == "string_too_long":
        explanation = f"请缩短至 {context.get('max_length')} 个字符以内"
    elif kind in {"too_long", "too_short"}:
        limit = context.get("max_length") if kind == "too_long" else context.get("min_length")
        explanation = f"最多填写 {limit} 项" if kind == "too_long" else f"至少填写 {limit} 项"
    elif kind == "string_pattern_mismatch":
        explanation = "请使用英文字母、数字和短横线，例如 guangmu-tv" if "slug" in error["loc"] else "请填写有效的颜色，例如 #245BDD"
    elif kind == "literal_error":
        explanation = "请选择列表中支持的选项"
    elif kind == "string_type":
        explanation = "请填写文字"
    elif kind in {"list_type", "model_type", "model_attributes_type", "dict_type"}:
        explanation = "内容格式不正确，请重新填写或重新选择"
    elif kind.startswith("datetime") or kind.startswith("date"):
        explanation = "时间格式不正确，请重新选择日期和时间"
    elif kind.startswith("bool"):
        explanation = "请选择开启或关闭"
    else:
        explanation = "填写格式不正确，请检查后重试"
    return location + "：" + explanation


class StationService:
    def __init__(self, db: Session):
        self.db = db

    def settings(self):
        item = self.db.get(StationSettings, "site")
        return SettingsWrite.model_validate(item) if item else SettingsWrite()

    def data(self, admin=False):
        software_query = select(StationSoftware).order_by(StationSoftware.created_at, StationSoftware.id)
        release_query = select(StationRelease).order_by(StationRelease.published_at.desc(), StationRelease.created_at.desc(), StationRelease.id)
        announcement_query = select(StationAnnouncement).order_by(StationAnnouncement.published_at.desc(), StationAnnouncement.created_at.desc())
        promotion_query = select(StationPromotion).order_by(StationPromotion.slug)
        settings = self.settings()
        if not admin:
            software_query = software_query.where(StationSoftware.published.is_(True))
            release_query = release_query.join(StationSoftware).where(StationRelease.published.is_(True), StationSoftware.published.is_(True))
            announcement_query = announcement_query.where(StationAnnouncement.published.is_(True))
            promotion_query = promotion_query.where(StationPromotion.published.is_(True))
        promotions = list(self.db.scalars(promotion_query))
        if not admin:
            now = utcnow()
            promotions = [p for p in promotions if settings.ads_enabled and (not p.starts_at or utc_datetime(p.starts_at) <= now) and (not p.ends_at or utc_datetime(p.ends_at) > now)]
        valid_promotions = []
        for promotion in promotions:
            try:
                read = PromotionRead.model_validate(promotion)
            except ValidationError:
                # A malformed future advertising configuration cannot prevent
                # software updates, notices or downloads from being read.
                logger.warning("Ignoring invalid station promotion id=%s", promotion.id)
                continue
            if not admin:
                # Placements switched off in settings are removed for every client.
                read.placements = [placement for placement in read.placements if settings.placement_enabled(placement)]
                if not read.placements:
                    continue
            valid_promotions.append(read)
        software = list(self.db.scalars(software_query))
        releases = enrich_releases(self.db, self.db.scalars(release_query))
        if not admin:
            releases = public_releases(releases, software)
        stats = StatsService(self.db).public([item.id for item in software], settings.hot_searches)
        return StationData(settings=settings, software=software, releases=releases, announcements=list(self.db.scalars(announcement_query)), promotions=valid_promotions, stats=stats)

    def software(self, slug):
        item = self.db.scalar(select(StationSoftware).where(StationSoftware.slug == slug, StationSoftware.published.is_(True)))
        if item is None:
            raise HTTPException(404, "没有找到这款软件，可能已下架。请返回软件目录查看。")
        releases = list(self.db.scalars(select(StationRelease).where(StationRelease.software_id == item.id, StationRelease.published.is_(True)).order_by(StationRelease.published_at.desc(), StationRelease.created_at.desc(), StationRelease.id)))
        notices = list(self.db.scalars(select(StationAnnouncement).join(StationAnnouncementSoftware).where(StationAnnouncementSoftware.software_id == item.id, StationAnnouncement.published.is_(True)).order_by(StationAnnouncement.published_at.desc())))
        return {"software": item, "releases": public_releases(enrich_releases(self.db, releases), [item]), "announcements": notices}

    def announcement(self, slug):
        item = self.db.scalar(select(StationAnnouncement).where(StationAnnouncement.slug == slug, StationAnnouncement.published.is_(True)))
        if item is None:
            raise HTTPException(404, "没有找到这条公告，可能已撤回。请返回公告列表查看。")
        return item

    def promotion(self, slug):
        item = self.db.scalar(select(StationPromotion).where(StationPromotion.slug == slug, StationPromotion.published.is_(True)))
        if not self.settings().ads_enabled or item is None:
            raise HTTPException(404, "活动尚未上线或已下线，请继续查看软件更新。")
        try:
            return PromotionRead.model_validate(item)
        except ValidationError as exc:
            raise HTTPException(503, "活动资料暂时无法显示，请先继续查看软件更新。") from exc

    def validate(self, schema, payload):
        try:
            return schema.model_validate(payload)
        except ValidationError as exc:
            messages = [validation_message(error) for error in exc.errors()]
            raise HTTPException(422, "；".join(messages)) from exc

    def save(self, kind, payload, admin_id, item_id=None, commit=True):
        model, write_schema, read_schema = {
            "software": (StationSoftware, SoftwareWrite, SoftwareRead),
            "release": (StationRelease, ReleaseWrite, ReleaseRead),
            "announcement": (StationAnnouncement, AnnouncementWrite, AnnouncementRead),
            "promotion": (StationPromotion, PromotionWrite, PromotionRead),
        }[kind]
        item = self.db.get(model, item_id) if item_id else model()
        if item is None:
            raise HTTPException(404, "内容不存在，请刷新列表后重试")
        before = read_schema.model_validate(item).model_dump(mode="json") if item_id else None
        merged = {field: before[field] for field in write_schema.model_fields if before and field in before}
        merged.update(payload)
        values = self.validate(write_schema, merged).model_dump()
        if item_id and kind in {"software", "announcement", "promotion"} and values["slug"] != item.slug:
            raise HTTPException(422, "分享链接创建后不能修改，以免群内已分享的链接失效。可以修改名称和正文。")
        if kind == "software":
            existing_platforms = set(self.db.scalars(select(StationRelease.platform).where(StationRelease.software_id == item_id))) if item_id else set()
            if existing_platforms - set(values["platforms"]):
                raise HTTPException(422, "已有版本记录的设备不能移除，请保留该设备并将对应版本设为暂不可用。")
        if kind == "release":
            software = self.db.get(StationSoftware, values["software_id"])
            if software is None:
                raise HTTPException(422, "对应的软件不存在，请先创建软件")
            if values["platform"] not in software.platforms:
                raise HTTPException(422, "该软件尚未支持此设备，请先在软件管理中添加设备")
            if item_id and (item.software_id != values["software_id"] or item.platform != values["platform"]):
                raise HTTPException(422, "版本所属的软件和设备不能更改，请为另一个设备新建版本")
            if item_id and (not values["published"] or values["status"] == "unavailable" or values["advice"] == "hold"):
                dependent = self.db.scalar(select(StationRelease.id).where(StationRelease.stable_release_id == item_id, StationRelease.published.is_(True)))
                if dependent:
                    raise HTTPException(422, "此版本正在被推荐为稳定版。请先修改引用它的版本，重新选择稳定版或撤回，再停用此版本。")
            if values["stable_release_id"]:
                stable = self.db.get(StationRelease, values["stable_release_id"])
                if stable is None or stable.id == item_id or stable.software_id != values["software_id"] or stable.platform != values["platform"] or not stable.published or stable.status == "unavailable" or stable.advice == "hold":
                    raise HTTPException(422, "推荐稳定版必须是同一软件、同一设备下已发布的其他版本")
            old_links = {link.id: link for link in item.links}
            next_links = []
            for index, value in enumerate(values.pop("links")):
                link_id = value.pop("id", None)
                if link_id and link_id not in old_links:
                    raise HTTPException(422, "获取入口不属于当前版本，沿用内容时请移除旧入口 ID")
                link = old_links.get(link_id) or StationReleaseLink()
                for key, val in value.items():
                    setattr(link, key, val)
                link.sort_order = index
                next_links.append(link)
            item.links = next_links
            if before:
                current_urls = {link.id: link.url for link in next_links if link.id}
                changed_links = {link["id"] for link in before["links"] if current_urls.get(link["id"]) != link["url"]}
                if changed_links:
                    self.db.execute(update(StationFeedbackIssue).where(StationFeedbackIssue.release_id == item_id, StationFeedbackIssue.status == "new", StationFeedbackIssue.kind == "link", (StationFeedbackIssue.link_id.in_(changed_links) | StationFeedbackIssue.link_id.is_(None))).values(status="handled", handled_at=utcnow()))
        if kind == "announcement":
            ids = values.pop("software_ids")
            found = set(self.db.scalars(select(StationSoftware.id).where(StationSoftware.id.in_(ids)))) if ids else set()
            if found != set(ids):
                raise HTTPException(422, "部分关联软件不存在，请刷新后重新选择")
            old = {row.software_id: row for row in item.associations}
            item.associations = [old.get(software_id) or StationAnnouncementSoftware(software_id=software_id) for software_id in ids]
        if kind in {"release", "announcement"}:
            # Publishing a draft gets its first publication time. Text corrections
            # retain that time and therefore never reorder historical releases.
            if values["published"] and not values["published_at"]:
                values["published_at"] = utcnow()
        for key, val in values.items():
            setattr(item, key, val)
        self.db.add(item)
        try:
            self.db.flush()
            after = read_schema.model_validate(item).model_dump(mode="json")
            if kind == "release":
                item = enrich_releases(self.db, [item])[0]
            CatalogService(self.db).audit(admin_id, "update" if item_id else "create", "station_" + kind, item.id, before, after)
            if commit:
                self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(409, "分享链接标识已被使用，请更换标识后重试；已填写的内容可以保留。") from exc
        return item

    def save_settings(self, payload, admin_id):
        before = self.settings().model_dump()
        values = self.validate(SettingsWrite, {**before, **payload}).model_dump()
        # Existing one-character names were allowed by earlier versions. Keep
        # them readable and permit unrelated settings until explicitly renamed.
        if "site_name" in payload and len(values["site_name"]) < 2:
            raise HTTPException(422, "站名：至少填写 2 个字")
        item = self.db.get(StationSettings, "site") or StationSettings(id="site")
        for key, value in values.items():
            setattr(item, key, value)
        self.db.add(item)
        CatalogService(self.db).audit(admin_id, "update", "station_settings", "site", before, values)
        self.db.commit()
        return item


MAX_IMAGE_BYTES = 5 * 1024 * 1024


def save_station_image(file: UploadFile, db: Session, admin_id: str):
    data = file.file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "图片不能超过 5 MB，请压缩图片后重试")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data), formats=["PNG", "JPEG", "WEBP"]) as source:
                if source.format not in {"PNG", "JPEG", "WEBP"} or source.width > 8000 or source.height > 8000 or source.width * source.height > 24_000_000:
                    raise ValueError("unsupported image or dimensions")
                source.load()
                clean = ImageOps.exif_transpose(source).convert("RGBA")
                clean.thumbnail((2400, 2400))
                output = io.BytesIO()
                # Copying pixels into a fresh image strips EXIF, profiles, comments
                # and all other uploaded metadata before persistent storage.
                pixels = Image.new("RGBA", clean.size)
                pixels.paste(clean)
                pixels.save(output, format="PNG", optimize=True)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise HTTPException(422, "请选择有效的 PNG、JPEG 或 WebP 图片（最长边不超过 8000 像素，总像素不超过 2400 万）") from exc
    filename = uuid.uuid4().hex + ".png"
    path = get_settings().upload_dir / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(output.getvalue())
    try:
        CatalogService(db).audit(admin_id, "upload", "station_image", filename[:32], after={"url": "/uploads/" + filename})
        db.commit()
    except Exception:
        db.rollback()
        path.unlink(missing_ok=True)
        raise
    return {"url": "/uploads/" + filename}
