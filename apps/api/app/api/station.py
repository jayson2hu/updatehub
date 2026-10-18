from fastapi import APIRouter, Body, File, UploadFile

from app.api.dependencies import CurrentAdmin, Database, WriteAdmin
from app.schemas.station import AnnouncementRead, PromotionRead, ReleaseRead, SettingsWrite, SoftwareDetail, SoftwareRead, StationData
from app.services.station import StationService, save_station_image

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
