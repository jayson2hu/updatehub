from typing import Annotated

from fastapi import APIRouter, File, Query, Request, Response, UploadFile

from app.api.dependencies import CurrentAdmin, Database, WriteAdmin
from app.core.config import get_settings
from app.core.security import SESSION_COOKIE, check_origin, login_limiter, request_client_key
from app.repositories.catalog import CatalogRepository
from app.schemas.auth import AdminRead, AuthResponse, LoginRequest
from app.schemas.catalog import AuditPage, AuditRead, CategoryPatch, CategoryRead, CategoryWrite, OkResponse, SoftwarePage, SoftwarePatch, SoftwareRead, SoftwareWrite, UploadResponse
from app.services.auth import AuthService
from app.services.catalog import CatalogService
from app.services.uploads import save_icon

router = APIRouter(prefix="/admin", tags=["administration"])


@router.post("/auth/login", response_model=AuthResponse)
def login(body: LoginRequest, request: Request, response: Response, db: Database):
    check_origin(request)
    login_limiter.hit("ip:" + request_client_key(request))
    # Also throttle distributed attempts against one account without storing raw email.
    from app.core.security import hash_token
    login_limiter.hit("account:" + hash_token(body.email))
    user, session, token = AuthService(db).login(body.email, body.password)
    conf = get_settings()
    response.set_cookie(SESSION_COOKIE, token, max_age=conf.session_ttl_hours * 3600, httponly=True, secure=conf.production, samesite="strict", path="/api/v1/admin")
    response.headers["Cache-Control"] = "no-store"
    return AuthResponse(user=AdminRead.model_validate(user), csrf_token=session.csrf_token)


@router.get("/auth/me", response_model=AuthResponse)
def me(session: CurrentAdmin, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return AuthResponse(user=AdminRead.model_validate(session.admin), csrf_token=session.csrf_token)


@router.post("/auth/logout", response_model=OkResponse)
def logout(session: WriteAdmin, response: Response, db: Database):
    AuthService(db).logout(session)
    response.delete_cookie(SESSION_COOKIE, path="/api/v1/admin", secure=get_settings().production, httponly=True, samesite="strict")
    return OkResponse()


@router.get("/software", response_model=SoftwarePage)
def list_software(db: Database, session: CurrentAdmin, q: Annotated[str, Query(max_length=160)] = "", category: Annotated[str, Query(max_length=100)] = "", platform: Annotated[str, Query(max_length=20)] = "", page: Annotated[int, Query(ge=1, le=10000)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 12):
    items, total = CatalogRepository(db).list_software(q=q, category=category, platform=platform, page=page, page_size=page_size, admin=True)
    return SoftwarePage(items=[SoftwareRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size)


@router.get("/software/{software_id}", response_model=SoftwareRead)
def get_software(software_id: str, db: Database, session: CurrentAdmin):
    return SoftwareRead.model_validate(CatalogService(db).get(software_id))


@router.post("/software", response_model=SoftwareRead, status_code=201)
def create_software(body: SoftwareWrite, db: Database, session: WriteAdmin):
    return SoftwareRead.model_validate(CatalogService(db).save(body, session.admin_user_id))


@router.patch("/software/{software_id}", response_model=SoftwareRead)
def update_software(software_id: str, body: SoftwarePatch, db: Database, session: WriteAdmin):
    return SoftwareRead.model_validate(CatalogService(db).save(body, session.admin_user_id, software_id))


@router.delete("/software/{software_id}", response_model=OkResponse)
def unpublish_software(software_id: str, db: Database, session: WriteAdmin):
    CatalogService(db).unpublish(software_id, session.admin_user_id)
    return OkResponse()


@router.post("/categories", response_model=CategoryRead, status_code=201)
def create_category(body: CategoryWrite, db: Database, session: WriteAdmin):
    return CategoryRead.model_validate(CatalogService(db).save_category(body, session.admin_user_id))


@router.patch("/categories/{category_id}", response_model=CategoryRead)
def update_category(category_id: str, body: CategoryPatch, db: Database, session: WriteAdmin):
    return CategoryRead.model_validate(CatalogService(db).save_category(body, session.admin_user_id, category_id))


@router.delete("/categories/{category_id}", response_model=OkResponse)
def delete_category(category_id: str, db: Database, session: WriteAdmin):
    CatalogService(db).delete_category(category_id, session.admin_user_id)
    return OkResponse()


@router.get("/audit", response_model=AuditPage)
def audit(db: Database, session: CurrentAdmin, page: Annotated[int, Query(ge=1, le=10000)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 20):
    items, total = CatalogRepository(db).audit_page(page, page_size)
    return AuditPage(items=[AuditRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size)


@router.post("/uploads/icon", response_model=UploadResponse, status_code=201)
def upload_icon(db: Database, session: WriteAdmin, file: Annotated[UploadFile, File()]):
    return UploadResponse(url=save_icon(file, db, session.admin_user_id))
