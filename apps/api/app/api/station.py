from typing import Annotated, Literal

from fastapi import APIRouter, Body, File, Query, Request, Response, UploadFile

from app.api.dependencies import CurrentAdmin, Database, WriteAdmin
from app.core.security import check_origin, request_client_key, station_events_limiter, station_feedback_limiter, station_sync_create_limiter, station_sync_restore_limiter
from app.schemas.station import (
    AnnouncementRead, EventBatch, FeedbackList, FeedbackUpdate, FeedbackWrite, PromotionRead, ReleaseRead, SettingsWrite, SoftwareDetail,
    SoftwareRead, StationDashboard, StationData, SyncRead, SyncWrite, WishRead, WishReceipt, WishUpdate, WishWrite,
)
from app.services.station import StationService, save_station_image
from app.services.station_engagement import FeedbackService, StationDashboardService, StatsService, SyncService, WishService

router = APIRouter(prefix="/station", tags=["station"])
admin_router = APIRouter(prefix="/admin/station", tags=["station administration"])


@router.get("/data", response_model=StationData)
def data(db: Database):
    return StationService(db).data()


@router.get("/software/{slug}", response_model=SoftwareDetail)
def software(slug: str, db: Database):
    return StationService(db).software(slug)


@router.get("/announcements/{slug}", response_model=AnnouncementRead)
def announcement(slug: str, db: Database):
    return StationService(db).announcement(slug)


@router.get("/promo/{slug}", response_model=PromotionRead)
def promotion(slug: str, db: Database):
    return StationService(db).promotion(slug)


def anonymous(request: Request, limiter, scope):
    """Shared guard for visitor writes: trusted origin and per-address throttle."""
    check_origin(request)
    limiter.hit(scope + ":" + request_client_key(request))


NO_STORE = {"Cache-Control": "no-store"}


@router.post("/feedback", status_code=204, response_class=Response, summary="匿名反馈版本能否使用", description="不保存 IP、设备或访客标识；补充说明会隐藏联系方式。")
def feedback(request: Request, db: Database, payload: dict = Body(...)):
    anonymous(request, station_feedback_limiter, "feedback")
    FeedbackService(db).submit(StationService(db).validate(FeedbackWrite, payload))
    return Response(status_code=204, headers=NO_STORE)


@router.post("/wishes", response_model=WishReceipt, status_code=201, summary="提交想要的软件")
def wish(request: Request, db: Database, response: Response, payload: dict = Body(...)):
    anonymous(request, station_feedback_limiter, "wish")
    response.headers.update(NO_STORE)
    return WishService(db).submit(StationService(db).validate(WishWrite, payload))


@router.post("/sync-codes", response_model=SyncRead, status_code=201, summary="生成收藏同步码（30 天有效）")
def create_sync_code(request: Request, db: Database, response: Response, payload: dict = Body(...)):
    anonymous(request, station_sync_create_limiter, "sync-create")
    response.headers.update(NO_STORE)
    return SyncService(db).create(StationService(db).validate(SyncWrite, payload))


@router.get("/sync-codes/{code}", response_model=SyncRead, summary="用同步码恢复收藏")
def restore_sync_code(code: str, request: Request, db: Database, response: Response):
    anonymous(request, station_sync_restore_limiter, "sync-restore")
    response.headers.update(NO_STORE)
    return SyncService(db).restore(code)


@router.post("/events", status_code=204, response_class=Response, summary="记录按日汇总的匿名统计", description="只累加计数；未知或已下架的内容会被忽略。")
def events(request: Request, db: Database, payload: dict = Body(...)):
    anonymous(request, station_events_limiter, "events")
    StatsService(db).record(StationService(db).validate(EventBatch, payload).events)
    return Response(status_code=204, headers=NO_STORE)


@admin_router.get("/data", response_model=StationData)
def admin_data(db: Database, admin: CurrentAdmin):
    return StationService(db).data(admin=True)


@admin_router.post("/software", response_model=SoftwareRead, status_code=201)
def create_software(db: Database, admin: WriteAdmin, payload: dict = Body(...)):
    return StationService(db).save("software", payload, admin.admin_user_id)


@admin_router.patch("/software/{item_id}", response_model=SoftwareRead)
def update_software(item_id: str, db: Database, admin: WriteAdmin, payload: dict = Body(...)):
    return StationService(db).save("software", payload, admin.admin_user_id, item_id)


@admin_router.post("/releases", response_model=ReleaseRead, status_code=201)
def create_release(db: Database, admin: WriteAdmin, payload: dict = Body(...)):
    return StationService(db).save("release", payload, admin.admin_user_id)


@admin_router.patch("/releases/{item_id}", response_model=ReleaseRead)
def update_release(item_id: str, db: Database, admin: WriteAdmin, payload: dict = Body(...)):
    return StationService(db).save("release", payload, admin.admin_user_id, item_id)


@admin_router.post("/announcements", response_model=AnnouncementRead, status_code=201)
def create_announcement(db: Database, admin: WriteAdmin, payload: dict = Body(...)):
    return StationService(db).save("announcement", payload, admin.admin_user_id)


@admin_router.patch("/announcements/{item_id}", response_model=AnnouncementRead)
def update_announcement(item_id: str, db: Database, admin: WriteAdmin, payload: dict = Body(...)):
    return StationService(db).save("announcement", payload, admin.admin_user_id, item_id)


@admin_router.patch("/settings", response_model=SettingsWrite)
def update_settings(db: Database, admin: WriteAdmin, payload: dict = Body(...)):
    return StationService(db).save_settings(payload, admin.admin_user_id)


@admin_router.post("/promotions", response_model=PromotionRead, status_code=201)
def create_promotion(db: Database, admin: WriteAdmin, payload: dict = Body(...)):
    return StationService(db).save("promotion", payload, admin.admin_user_id)


@admin_router.patch("/promotions/{item_id}", response_model=PromotionRead)
def update_promotion(item_id: str, db: Database, admin: WriteAdmin, payload: dict = Body(...)):
    return StationService(db).save("promotion", payload, admin.admin_user_id, item_id)


@admin_router.post("/uploads", status_code=201)
def upload_image(db: Database, admin: WriteAdmin, file: UploadFile = File(...)):
    return save_station_image(file, db, admin.admin_user_id)


@admin_router.get("/dashboard", response_model=StationDashboard)
def dashboard(db: Database, admin: CurrentAdmin, days: Annotated[int, Query(ge=1, le=90)] = 7):
    service = StationService(db)
    return StationDashboardService(db).read(days, service.settings())


@admin_router.get("/feedback", response_model=FeedbackList)
def feedback_list(db: Database, admin: CurrentAdmin, status: Literal["new", "handled", "ignored"] | None = None, kind: str | None = Query(None, max_length=20), software_id: str | None = Query(None, max_length=36)):
    return FeedbackService(db).issues(status, kind, software_id)


@admin_router.patch("/feedback", status_code=204, response_class=Response)
def update_feedback(db: Database, admin: WriteAdmin, payload: dict = Body(...)):
    FeedbackService(db).update(StationService(db).validate(FeedbackUpdate, payload), admin.admin_user_id)
    return Response(status_code=204)


@admin_router.get("/wishes", response_model=list[WishRead])
def wishes(db: Database, admin: CurrentAdmin, status: Literal["new", "planned", "added", "rejected"] | None = None):
    return WishService(db).list(status)


@admin_router.patch("/wishes/{wish_id}", response_model=WishRead)
def update_wish(wish_id: str, db: Database, admin: WriteAdmin, payload: dict = Body(...)):
    return WishService(db).update(wish_id, StationService(db).validate(WishUpdate, payload), admin.admin_user_id)
