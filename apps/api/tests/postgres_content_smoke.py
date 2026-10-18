"""Destructive smoke ONLY for a new empty updatehub_test_* PostgreSQL database.

Run from tests/portable-postgres.mjs --content, or provide an isolated database.
No preview, live database, credentials, or external network destinations are used.
"""
import os
import re
import secrets
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, func, inspect, select, text
from sqlalchemy.engine import make_url

API_ROOT = Path(__file__).resolve().parents[1]
raw_url = os.environ.get("DATABASE_URL", "")
if not raw_url:
    raise SystemExit("DATABASE_URL must identify a new isolated PostgreSQL test database.")
url = make_url(raw_url)
if url.drivername != "postgresql+psycopg" or not re.fullmatch(r"updatehub_test_[a-z0-9_]+", url.database or ""):
    raise SystemExit("Refusing database: an isolated postgresql+psycopg updatehub_test_* name is required.")
probe = create_engine(url)
with probe.connect() as connection:
    schemas = connection.execute(text("SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast') AND schema_name NOT LIKE 'pg_temp_%' AND schema_name NOT LIKE 'pg_toast_temp_%'"))
    inspector = inspect(connection)
    for (schema,) in schemas:
        if inspector.get_table_names(schema=schema) or inspector.get_view_names(schema=schema):
            raise SystemExit("Refusing nonempty database: create a fresh isolated test database.")
    print(connection.execute(text("SELECT version()")).scalar_one())
probe.dispose()
os.environ["ENVIRONMENT"] = "development"
os.chdir(API_ROOT)
sys.path.insert(0, str(API_ROOT))
checks = 0


def verify(condition, description):
    global checks
    if not condition:
        raise AssertionError(description)
    checks += 1


with tempfile.TemporaryDirectory(prefix="updatehub-content-pg-") as folder:
    os.environ["UPLOAD_DIR"] = folder
    from fastapi.testclient import TestClient
    from app.core.database import SessionLocal, engine
    from app.core.security import password_hasher
    from app.main import app
    from app.models import AdminUser, AnalyticsDaily, ContentDocument, Software
    from app.models.entities import utcnow
    from app.repositories.content import ContentRepository
    from app.schemas.analytics import SearchEvent
    from app.schemas.catalog import SoftwareWrite
    from app.seed import seed
    from app.seed_content import seed_content
    from app.services.analytics import AnalyticsService
    from app.services.catalog import CatalogService

    config = Config("alembic.ini")
    command.upgrade(config, "3c0114d69cdc")
    with SessionLocal() as db:
        original = CatalogService(db).save(SoftwareWrite(name="Existing reviewed software", slug="pre-content-migration", published=True, latest_version="reviewed-version", update_reason="independent facts", official_links=[{"label": "Official", "url": "https://example.com/"}]), None)
        original_id = original.id
    command.upgrade(config, "head")
    command.check(config)
    with SessionLocal() as db:
        original = db.get(Software, original_id)
        verify(original.latest_version == "reviewed-version" and original.update_reason == "independent facts", "Populated upgrade must preserve independent software facts")
        verify({"content_document", "content_item", "analytics_daily"}.issubset(inspect(db.bind).get_table_names()), "Content migration creates all tables")
        verify(seed(db) == 12, "Demo catalog seed adds twelve eligible records")
        verify(seed_content(db) == 19, "Content seed adds four guides, ten FAQ and five collections")
        verify(seed_content(db) == 0, "Content seeding is idempotent")
        repo = ContentRepository(db)
        docs, total = repo.list(kind="collection", purpose="开发编程", platform="windows")
        verify(total == 1 and docs[0].slug == "developer-starter", "PostgreSQL JSON purposes + relational platforms combine with AND")
        verify(repo.list(kind="collection", purpose="开发", platform="windows")[1] == 0, "JSON filters use exact values")
        verify(repo.list(kind="guide", platform="windows", purpose="学习")[1] == 2, "Document JSON array membership works on PostgreSQL")
        verify(repo.list(kind="guide", q="二十秒")[1] == 1, "PostgreSQL searches actual guide section text")
        verify(repo.list(kind="guide", q="小鲸鱼")[1] == 0, "Search only finds associated curated software")
        verify(repo.list(kind="guide", q="蓝色代码编辑器")[1] == 1, "PostgreSQL content search includes associated software aliases")
        admin_password = secrets.token_urlsafe(32)
        db.add(AdminUser(email="content-test@example.com", password_hash=password_hasher.hash(admin_password)))
        db.commit()
        vscode = db.scalar(select(Software).where(Software.slug == "vscode"))
        vscode_id = vscode.id
        link_id = vscode.official_links[0].id

    with TestClient(app) as client:
        verify(client.get("/api/v1/admin/dashboard").status_code == 401, "Dashboard requires authentication")
        verify(client.get("/ready").status_code == 200, "Readiness recognizes latest content migration")
        response = client.post("/api/v1/admin/auth/login", json={"email": "content-test@example.com", "password": admin_password})
        verify(response.status_code == 200, "Database sessions authenticate")
        client.headers["X-CSRF-Token"] = response.json()["csrf_token"]
        for route, count in (("guides", 4), ("faq", 10), ("collections", 5)):
            response = client.get("/api/v1/" + route)
            verify(response.status_code == 200 and response.json()["total"] == count, "Public content counts reflect published rows: " + route)
        body = {"kind": "guide", "title": "PostgreSQL guide", "slug": "postgres-guide", "summary": "Useful summary", "sections": [{"title": "Step"}], "software_id": vscode_id, "is_demo": True}
        response = client.post("/api/v1/admin/content", json=body)
        verify(response.status_code == 201, "Incomplete guide steps can be saved as a draft")
        document_id = response.json()["id"]
        path = "/api/v1/admin/content/" + document_id
        verify(client.get("/api/v1/guides/postgres-guide").status_code == 404, "Draft detail remains private")
        verify(client.post(path + "/publish", json={"confirmed": True}).status_code == 422, "Incomplete guide cannot publish")
        verify(client.patch(path, json={"sections": [{"title": "Step", "body": "Verified instruction"}]}).status_code == 200, "Draft steps update")
        verify(client.post(path + "/publish", json={"confirmed": True}).status_code == 200, "Explicit publish succeeds")
        verify(client.patch(path, json={"title": "Silent edit"}).status_code == 409, "Published guide cannot be changed without unpublishing")
        verify(client.get("/api/v1/guides/postgres-guide").json()["published_at"].endswith("Z"), "PostgreSQL timestamps are explicitly UTC")
        verify(client.post(path + "/unpublish").status_code == 200, "Explicit unpublish succeeds")
        verify(client.get("/api/v1/guides/postgres-guide").status_code == 404, "Unpublish withdraws public detail")
        verify(client.delete(path).json()["status"] == "archived", "DELETE soft-archives content")
        collection = client.get("/api/v1/collections/developer-starter").json()
        collection_path = "/api/v1/admin/content/" + collection["id"]
        verify(client.post(collection_path + "/unpublish").status_code == 200, "Collection can enter editable draft")
        reversed_members = [{"id": member["id"], "software_id": member["software_id"], "sort_order": index} for index, member in enumerate(reversed(collection["items"]))]
        reordered = client.patch(collection_path, json={"items": reversed_members})
        verify(reordered.status_code == 200 and [member["id"] for member in reordered.json()["items"]] == [member["id"] for member in reversed(collection["items"])], "Collection membership reorder preserves IDs")
        verify(client.post(collection_path + "/publish", json={"confirmed": True}).status_code == 200, "Collection republishes after review")
        verify(client.delete("/api/v1/admin/software/" + vscode_id).status_code == 200, "Software unpublish succeeds")
        public_collection = client.get("/api/v1/collections/developer-starter").json()
        verify(vscode_id not in str(public_collection), "Hidden collection members never expose IDs or names")
        verify(client.get("/api/v1/guides/vscode-first-project").status_code == 404, "Hidden associated software withdraws guide")
        verify(client.get("/api/v1/collections", params={"software_id": vscode_id}).json()["total"] == 0, "Hidden member cannot match public filters")
        verify(client.patch("/api/v1/admin/software/" + vscode_id, json={"published": True}).status_code == 200, "Software publication restores eligible associations")
        verify(client.get("/api/v1/finder?q=帮我找个录屏工具").json()["items"][0]["slug"] == "obs", "Finder matches curated phrases")
        verify(client.post("/api/v1/analytics/events", json={"event": "search", "query": "未收录截图工具", "scope": "software", "result_count": 0}).status_code == 204, "Public visible-search event accepted")
        verify(client.post("/api/v1/analytics/events", json={"event": "search", "query": "private@example.com", "scope": "software", "result_count": 0}).status_code == 204, "Sensitive-format query is aggregated without raw value")
        verify(client.get("/go/" + link_id, follow_redirects=False).status_code == 302, "Validated official click redirects")
        verify(client.get("/go/" + link_id, headers={"Purpose": "prefetch"}, follow_redirects=False).status_code == 302, "Prefetch does not count a click")
        dashboard = client.get("/api/v1/admin/dashboard?days=7").json()
        verify(dashboard["analytics"]["official_clicks"] == 1, "Official-click PostgreSQL aggregate is exact")
        verify(dashboard["analytics"]["searches"] == 2 and dashboard["analytics"]["no_result_searches"] == 2, "Search aggregates count submitted results")
        verify("private@example.com" not in str(dashboard), "Raw sensitive query never appears in dashboard")

    def record_search(_):
        with SessionLocal() as db:
            AnalyticsService(db).search(SearchEvent(event="search", query="并发计数", result_count=0))
    with ThreadPoolExecutor(max_workers=6) as executor:
        list(executor.map(record_search, range(24)))
    with SessionLocal() as db:
        counter = db.scalar(select(AnalyticsDaily).where(AnalyticsDaily.key == "并发计数"))
        verify(counter.count == 24 and counter.no_result_count == 24, "PostgreSQL atomic upsert does not lose concurrent events")
        db.add(AnalyticsDaily(day=utcnow().date() - timedelta(days=90), event="search", scope="software", key="expired", count=1, no_result_count=1))
        db.commit()
        AnalyticsService(db).search(SearchEvent(event="search", query="新搜索", result_count=1))
        verify(db.scalar(select(func.count()).select_from(AnalyticsDaily).where(AnalyticsDaily.key == "expired")) == 0, "New aggregate writes purge expired days")
        verify(AnalyticsService(db).purge(all_data=True) > 0, "Operator can clear all aggregates")
        verify(AnalyticsService(db).summary(30).searches == 0, "Cleared metrics are truly removed")
    command.check(config)
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    command.check(config)
    verify(set(inspect(engine).get_table_names()) >= {"content_document", "content_item", "analytics_daily"}, "Full PostgreSQL migration roundtrip rebuilds schema without drift")
    engine.dispose()
    print(f"CONTENT_POSTGRES_CHECKS_PASSED={checks}")
