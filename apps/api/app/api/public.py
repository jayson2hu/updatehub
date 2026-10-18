from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse

from app.api.dependencies import Database
from app.core.config import get_settings
from app.core.security import public_limiter, request_client_key
from app.core.urls import validate_official_url
from app.repositories.catalog import CatalogRepository
from app.schemas.catalog import CategoryRead, SiteSettingsRead, SoftwarePage, SoftwareRead
from app.services.analytics import AnalyticsService

router = APIRouter(tags=["catalog"])
redirect_router = APIRouter(tags=["official links"])


@router.get("/settings", response_model=SiteSettingsRead)
def settings():
    conf = get_settings()
    return SiteSettingsRead(site_name=conf.site_name, site_description=conf.site_description)


@router.get("/categories", response_model=list[CategoryRead])
def categories(db: Database):
    return [CategoryRead.model_validate(row) for row in CatalogRepository(db).categories()]


@router.get("/search", response_model=SoftwarePage)
@router.get("/software", response_model=SoftwarePage)
def software_list(request: Request, db: Database, q: Annotated[str, Query(max_length=160)] = "", category: Annotated[str, Query(max_length=100)] = "", platform: Annotated[str, Query(max_length=20)] = "", page: Annotated[int, Query(ge=1, le=10000)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 12):
    public_limiter.hit("catalog:" + request_client_key(request))
    items, total = CatalogRepository(db).list_software(q=q, category=category, platform=platform, page=page, page_size=page_size)
    return SoftwarePage(items=[SoftwareRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size)


@router.get("/software/{slug}", response_model=SoftwareRead)
def software_detail(slug: str, db: Database):
    item = CatalogRepository(db).by_slug(slug)
    if item is None:
        raise HTTPException(404, "没有找到这款软件，它可能尚未发布")
    return SoftwareRead.model_validate(item)


@router.get("/finder", response_model=SoftwarePage, summary="根据描述线索寻找已收录软件")
def software_finder(request: Request, db: Database, q: Annotated[str, Query(max_length=160)] = "", category: Annotated[str, Query(max_length=100)] = "", platform: Annotated[str, Query(max_length=20)] = "", page: Annotated[int, Query(ge=1, le=10000)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 12):
    public_limiter.hit("catalog:" + request_client_key(request))
    items, total = CatalogRepository(db).list_software(q=q, category=category, platform=platform, page=page, page_size=page_size, finder=True)
    return SoftwarePage(items=[SoftwareRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size)


@redirect_router.get("/go/{link_id}", status_code=302, response_class=RedirectResponse, responses={302: {"description": "Redirect to an active official link stored by an administrator"}})
def official_redirect(link_id: str, request: Request, db: Database):
    public_limiter.hit("redirect:" + request_client_key(request))
    if request.query_params:
        raise HTTPException(400, "官方跳转仅接受已登记的链接 ID")
    link = CatalogRepository(db).active_link(link_id)
    if link is None:
        raise HTTPException(404, "官方入口不存在或已停用")
    try:
        url = validate_official_url(link.url)
    except ValueError as exc:
        raise HTTPException(422, "官方入口地址需要管理员重新核验") from exc
    if "prefetch" not in (request.headers.get("purpose", "") + request.headers.get("sec-purpose", "")).lower():
        AnalyticsService(db).official_click(link)
    return RedirectResponse(url=url, status_code=302, headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})
