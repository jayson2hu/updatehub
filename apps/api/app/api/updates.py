from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, Request

from app.api.dependencies import CurrentAdmin, Database, WriteAdmin
from app.core.security import public_limiter, request_client_key
from app.repositories.catalog import CatalogRepository
from app.repositories.updates import UpdateRepository
from app.schemas.updates import NotificationRead, PublishConfirmation, UpdatePage, UpdatePatch, UpdateRead, UpdateWrite
from app.services.updates import UpdateService

router = APIRouter(tags=["announcements"])
admin_router = APIRouter(prefix="/admin/updates", tags=["announcement administration"])
admin_history_router = APIRouter(prefix="/admin/software", tags=["version administration"])


def result_page(db, **filters):
    items, total = UpdateRepository(db).list(**filters)
    return UpdatePage(items=[UpdateRead.model_validate(item) for item in items], total=total, page=filters.get("page", 1), page_size=filters.get("page_size", 12))


def parsed_ids(value: str | None):
    if value is None:
        return None
    values = list(dict.fromkeys(v.strip() for v in value.split(",") if v.strip()))
    if len(values) > 500 or any(len(v) > 36 for v in values):
        raise HTTPException(422, "一次最多筛选 500 款软件，软件 ID 不能超过 36 个字符")
    return values


@router.get("/updates", response_model=UpdatePage)
def public_updates(request: Request, db: Database, q: Annotated[str, Query(max_length=160)] = "", kind: Annotated[str, Query(max_length=20)] = "", software_id: Annotated[str, Query(max_length=36)] = "", software_ids: Annotated[str | None, Query(max_length=20000)] = None, update_level: Annotated[str, Query(max_length=20)] = "", page: Annotated[int, Query(ge=1, le=10000)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 12, include_historical: bool = False):
    public_limiter.hit("updates:" + request_client_key(request))
    return result_page(db, q=q, kind=kind, software_id=software_id, software_ids=parsed_ids(software_ids), update_level=update_level, page=page, page_size=page_size, include_historical=include_historical)


@router.get("/updates/{slug}", response_model=UpdateRead)
def public_update(slug: str, db: Database):
    item = UpdateRepository(db).public_by_slug(slug)
    if item is None:
        raise HTTPException(404, "公告不存在或尚未公开")
    return UpdateRead.model_validate(item)


@router.get("/software/{slug}/updates", response_model=UpdatePage)
def software_updates(slug: str, db: Database, page: Annotated[int, Query(ge=1, le=10000)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 12, include_historical: bool = False):
    software = CatalogRepository(db).by_slug(slug)
    if software is None:
        raise HTTPException(404, "没有找到这款软件")
    return result_page(db, software_id=software.id, page=page, page_size=page_size, include_historical=include_historical)


@router.get(
    "/software/{slug}/history",
    response_model=UpdatePage,
    summary="查看软件的公开历史版本",
    description="仅返回公开软件下已发布的 release 公告。按官方发布日期倒序；未填写时使用首次发布时间的 UTC 日期。同日期按首次发布时间、ID 倒序。忽略置顶，历史补录按实际版本日期插入；不按版本字符串推测先后。草稿、待审核、归档及已下线软件不可见。历史首条不一定是档案当前版本：归档不会回退已记录的软件事实。",
    responses={404: {"description": "软件不存在或未公开"}},
)
def software_history(slug: str, db: Database, page: Annotated[int, Query(ge=1, le=10000)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 12):
    software = CatalogRepository(db).by_slug(slug)
    if software is None:
        raise HTTPException(404, "没有找到这款软件")
    items, total = UpdateRepository(db).history(software.id, page=page, page_size=page_size)
    return UpdatePage(items=[UpdateRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size)


@router.get("/software/{slug}/current-release", response_model=UpdateRead | None, summary="查看当前版本对应的公开公告", description="仅返回持久来源指针指向、已公开且版本号、演示属性、建议等级和建议原因均与软件当前事实一致的非历史版本公告。归档、来源不明或任一事实不一致时返回 null；不修改来源指针或软件事实。", responses={404: {"description": "软件不存在或未公开"}})
def current_release(slug: str, db: Database):
    software = CatalogRepository(db).by_slug(slug)
    if software is None:
        raise HTTPException(404, "没有找到这款软件")
    if not software.current_release_id:
        return None
    item = UpdateRepository(db).by_id(software.current_release_id)
    if item is None or item.software_id != software.id or item.kind != "release" or item.status != "published" or item.is_historical or item.version != software.latest_version or item.is_demo != software.is_demo or item.update_level != software.update_level or item.reason_to_update != software.update_reason:
        return None
    return UpdateRead.model_validate(item)


@admin_history_router.get("/{software_id}/history", response_model=UpdatePage, summary="管理软件版本记录")
def admin_software_history(software_id: str, db: Database, session: CurrentAdmin, status: Literal["", "draft", "review", "published", "archived"] = "", page: Annotated[int, Query(ge=1, le=10000)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 12):
    if CatalogRepository(db).by_id(software_id) is None:
        raise HTTPException(404, "没有找到这款软件")
    items, total = UpdateRepository(db).history(software_id, page=page, page_size=page_size, admin=True, status=status)
    return UpdatePage(items=[UpdateRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size)


@admin_router.get("", response_model=UpdatePage)
def admin_updates(db: Database, session: CurrentAdmin, q: Annotated[str, Query(max_length=160)] = "", kind: Annotated[str, Query(max_length=20)] = "", software_id: Annotated[str, Query(max_length=36)] = "", update_level: Annotated[str, Query(max_length=20)] = "", status: Annotated[str, Query(max_length=20)] = "", page: Annotated[int, Query(ge=1, le=10000)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 12):
    return result_page(db, q=q, kind=kind, software_id=software_id, update_level=update_level, status=status, page=page, page_size=page_size, admin=True)


@admin_router.get("/{update_id}", response_model=UpdateRead)
def admin_update(update_id: str, db: Database, session: CurrentAdmin):
    return UpdateRead.model_validate(UpdateService(db).get(update_id))


@admin_router.post("", response_model=UpdateRead, status_code=201)
def create_update(body: UpdateWrite, db: Database, session: WriteAdmin):
    return UpdateRead.model_validate(UpdateService(db).save(body, session.admin_user_id))


@admin_router.patch("/{update_id}", response_model=UpdateRead)
def patch_update(update_id: str, body: UpdatePatch, db: Database, session: WriteAdmin):
    return UpdateRead.model_validate(UpdateService(db).save(body, session.admin_user_id, update_id))


@admin_router.post("/{update_id}/publish", response_model=UpdateRead)
def publish_update(update_id: str, body: PublishConfirmation, db: Database, session: WriteAdmin):
    return UpdateRead.model_validate(UpdateService(db).publish(update_id, session.admin_user_id))


@admin_router.post("/{update_id}/archive", response_model=UpdateRead)
def archive_update(update_id: str, db: Database, session: WriteAdmin):
    return UpdateRead.model_validate(UpdateService(db).archive(update_id, session.admin_user_id))


@admin_router.get("/{update_id}/notification", response_model=NotificationRead)
def notification(update_id: str, db: Database, session: CurrentAdmin, format: Literal["plain", "markdown"] = "plain"):
    return NotificationRead(text=UpdateService(db).notification(update_id, format))
