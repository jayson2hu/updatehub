from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, Request

from app.api.dependencies import CurrentAdmin, Database, WriteAdmin
from app.core.security import public_limiter, request_client_key
from app.repositories.content import ContentRepository
from app.schemas.content import ContentKind, ContentPage, ContentPatch, ContentRead, ContentWrite, content_read
from app.schemas.updates import PublishConfirmation
from app.services.content import ContentService

router = APIRouter(tags=["guides, FAQ and collections"])
admin_router = APIRouter(prefix="/admin/content", tags=["content administration"])


def page_result(db, **filters):
    items, total = ContentRepository(db).list(**filters)
    return ContentPage(items=[content_read(item, public=not filters.get("admin", False)) for item in items], total=total, page=filters.get("page", 1), page_size=filters.get("page_size", 12))


def register_public(path, kind):
    def listing(request: Request, db: Database, q: Annotated[str, Query(max_length=160)] = "", software_id: Annotated[str, Query(max_length=36)] = "", category: Annotated[str, Query(max_length=100)] = "", platform: Annotated[str, Query(max_length=20)] = "", purpose: Annotated[str, Query(max_length=80)] = "", page: Annotated[int, Query(ge=1, le=10000)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 12):
        public_limiter.hit("content:" + request_client_key(request))
        return page_result(db, kind=kind, q=q, software_id=software_id, category=category, platform=platform, purpose=purpose, page=page, page_size=page_size)

    def detail(slug: str, db: Database):
        item = ContentRepository(db).public_by_slug(kind, slug)
        if item is None:
            raise HTTPException(404, "内容不存在或尚未公开")
        return content_read(item, public=True)

    router.add_api_route(path, listing, methods=["GET"], response_model=ContentPage, name=f"list_{kind}")
    router.add_api_route(path + "/{slug}", detail, methods=["GET"], response_model=ContentRead, name=f"detail_{kind}")


for public_path, content_kind in (("/guides", "guide"), ("/faq", "faq"), ("/collections", "collection")):
    register_public(public_path, content_kind)


@admin_router.get("", response_model=ContentPage)
def list_content(db: Database, session: CurrentAdmin, kind: Literal["", "guide", "faq", "collection"] = "", status: Literal["", "draft", "published", "archived"] = "", q: Annotated[str, Query(max_length=160)] = "", software_id: Annotated[str, Query(max_length=36)] = "", category: Annotated[str, Query(max_length=100)] = "", platform: Annotated[str, Query(max_length=20)] = "", purpose: Annotated[str, Query(max_length=80)] = "", page: Annotated[int, Query(ge=1, le=10000)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 12):
    return page_result(db, kind=kind, status=status, q=q, software_id=software_id, category=category, platform=platform, purpose=purpose, page=page, page_size=page_size, admin=True)


@admin_router.get("/{document_id}", response_model=ContentRead)
def detail_content(document_id: str, db: Database, session: CurrentAdmin):
    return content_read(ContentService(db).get(document_id))


@admin_router.post("", response_model=ContentRead, status_code=201)
def create_content(body: ContentWrite, db: Database, session: WriteAdmin):
    return content_read(ContentService(db).save(body, session.admin_user_id))


@admin_router.patch("/{document_id}", response_model=ContentRead)
def update_content(document_id: str, body: ContentPatch, db: Database, session: WriteAdmin):
    return content_read(ContentService(db).save(body, session.admin_user_id, document_id))


@admin_router.post("/{document_id}/publish", response_model=ContentRead)
def publish_content(document_id: str, body: PublishConfirmation, db: Database, session: WriteAdmin):
    return content_read(ContentService(db).transition(document_id, session.admin_user_id, "published"))


@admin_router.post("/{document_id}/unpublish", response_model=ContentRead)
def unpublish_content(document_id: str, db: Database, session: WriteAdmin):
    return content_read(ContentService(db).transition(document_id, session.admin_user_id, "draft"))


@admin_router.post("/{document_id}/archive", response_model=ContentRead)
@admin_router.delete("/{document_id}", response_model=ContentRead)
def archive_content(document_id: str, db: Database, session: WriteAdmin):
    return content_read(ContentService(db).transition(document_id, session.admin_user_id, "archived"))
