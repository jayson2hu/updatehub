"""Real PostgreSQL migration/API smoke for a NEW, EMPTY updatehub_test_* database.

Run with apps/api/.venv/Scripts/python tests/postgres_smoke.py (Windows), or an
equivalent Python with apps/api/requirements.txt installed. DATABASE_URL is the
only required environment variable. This script creates temporary test data and
runs a migration downgrade/upgrade, so it refuses non-test names and nonempty DBs.
"""
import io
import os
import re
import secrets
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import Boolean, DateTime, JSON, MetaData, Table, create_engine, event, inspect, text
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "apps" / "api"
raw_url = os.environ.get("DATABASE_URL", "")
if not raw_url:
    raise SystemExit("DATABASE_URL must point to a new, empty PostgreSQL test database.")
url = make_url(raw_url)
if url.drivername != "postgresql+psycopg" or not re.fullmatch(r"updatehub_test_[a-z0-9_]+", url.database or ""):
    raise SystemExit("Refusing database: use postgresql+psycopg and a dedicated updatehub_test_* name.")

# Refuse BEFORE migrations or writes, even if an existing database has a test-like name.
probe = create_engine(url)
with probe.connect() as connection:
    schemas = connection.execute(text("SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast') AND schema_name NOT LIKE 'pg_temp_%' AND schema_name NOT LIKE 'pg_toast_temp_%'"))
    inspector = inspect(connection)
    for (schema,) in schemas:
        if inspector.get_table_names(schema=schema) or inspector.get_view_names(schema=schema):
            raise SystemExit("Refusing nonempty database: create a fresh isolated test database first.")
    print(connection.execute(text("SELECT version()")).scalar_one())
probe.dispose()

admin_password = secrets.token_urlsafe(32)
redactions = [v for v in (url.password, admin_password) if v]


def clean(value: str) -> str:
    for secret in redactions:
        value = value.replace(secret, "[redacted]")
    return value


def maintenance(*args: str):
    result = subprocess.run([sys.executable, "-m", *args], cwd=API_ROOT, capture_output=True, text=True, encoding="utf-8", env=os.environ.copy())
    print(clean(result.stdout), end="")
    print(clean(result.stderr), end="", file=sys.stderr)
    if result.returncode:
        raise RuntimeError(f"Maintenance command failed: {' '.join(args)}")


checks = 0


def verify(condition: bool, message: str):
    global checks
    if not condition:
        raise AssertionError(message)
    checks += 1
    print("PASS", message)


def migration_compatibility():
    """Upgrade a populated first-round schema before checking the current head."""
    maintenance("alembic", "upgrade", "f6ed3cd8a998")
    from app.models import Software
    legacy_id = str(uuid.uuid4())
    legacy_engine = create_engine(url)
    with legacy_engine.begin() as connection:
        connection.execute(Software.__table__.insert().values(id=legacy_id, name="Legacy migration record", slug="pg-legacy-migration-record", latest_version="LEGACY-1", published=False, is_demo=False))
    maintenance("alembic", "upgrade", "d9e4582f723c")
    old_updates = Table("release_update", MetaData(), autoload_with=legacy_engine)
    old_release_id = str(uuid.uuid4())
    instant = datetime(2026, 9, 21, 6, 30, tzinfo=timezone.utc)
    old_record = {}
    for column in old_updates.columns:
        old_record[column.name] = None if column.nullable else instant if isinstance(column.type, DateTime) else False if isinstance(column.type, Boolean) else [] if isinstance(column.type, JSON) else ""
    old_record.update(id=old_release_id, slug="pg-legacy-release", title="Legacy release", kind="release", software_id=legacy_id, version="LEGACY-1", update_level="optional", status="archived", published_at=instant)
    with legacy_engine.begin() as connection:
        connection.execute(old_updates.insert().values(**old_record))
    maintenance("alembic", "upgrade", "head")
    with legacy_engine.connect() as connection:
        row = connection.execute(text("SELECT name, latest_version, published FROM software WHERE id=:id"), {"id": legacy_id}).one()
        verify(row.name == "Legacy migration record" and row.latest_version == "LEGACY-1" and not row.published, "First-round software data preserved when adding announcements")
        verify("release_update" in inspect(connection).get_table_names(), "Announcement table exists after first-round migration upgrade")
        verify(connection.execute(text("SELECT current_release_id FROM software WHERE id=:id"), {"id": legacy_id}).scalar_one() == old_release_id, "Migration backfills unambiguous archived version provenance without changing facts")
    legacy_engine.dispose()


def announcement_checks(client, software_id):
    def create_update(slug, **overrides):
        payload = {"slug": slug, "title": "PGSMOKE 公告 " + slug, "summary": "验证更新是否影响读者", "content": "公告正文与真实 PostgreSQL 发布事务验证。", "kind": "release", "software_id": software_id, "version": "2.0", "previous_version": "1.0", "update_level": "recommended", "changes": ["修复集成测试问题"], "reason_to_update": "先保存工作，再按官方说明更新。", "who_should_update": "使用该软件的 Windows 用户", "official_release_url": "https://example.com/releases", "official_release_date": "2026-01-01", "status": "draft", **overrides}
        response = client.post("/api/v1/admin/updates", json=payload)
        verify(response.status_code == 201, f"Create announcement {slug}")
        return response.json()

    def publish(item):
        response = client.post(f"/api/v1/admin/updates/{item['id']}/publish", json={"confirmed": True})
        verify(response.status_code == 200, f"Manually publish {item['slug']}")
        return response.json()

    def current_version():
        return client.get(f"/api/v1/admin/software/{software_id}").json()

    old = create_update("pg-smoke-old-release")
    verify(client.get("/api/v1/updates/pg-smoke-old-release").status_code == 404, "Draft announcement excluded from public detail")
    verify(client.patch(f"/api/v1/admin/updates/{old['id']}", json={"status": "published"}).status_code == 409, "Partial status PATCH cannot bypass manual publication")
    verify(client.post(f"/api/v1/admin/updates/{old['id']}/publish", json={"confirmed": False}).status_code == 422, "Publication requires true manual confirmation")
    old = publish(old)
    verify(current_version()["latest_version"] == "2.0", "Announcement publication synchronizes software version")
    newer = publish(create_update("pg-smoke-new-release", version="3.0", official_release_date="2026-02-01"))
    verify(client.patch(f"/api/v1/admin/updates/{newer['id']}", json={"is_demo": True}).status_code == 409, "Published real announcement cannot switch into demo classification")
    verify(current_version()["latest_version"] == "3.0" and not current_version()["is_demo"], "Rejected demo reclassification retains real software facts")
    before_audit = client.get("/api/v1/admin/audit").json()["total"]
    rejected = client.patch(f"/api/v1/admin/updates/{newer['id']}", json={"who_should_update": "", "version": "BROKEN"})
    verify(rejected.status_code == 422, "Published partial update revalidates complete publication requirements")
    verify(current_version()["latest_version"] == "3.0" and client.get("/api/v1/updates/pg-smoke-new-release").json()["version"] == "3.0" and client.get("/api/v1/admin/audit").json()["total"] == before_audit, "Rejected partial update leaves announcement, software and audit unchanged")
    edited = client.patch(f"/api/v1/admin/updates/{old['id']}", json={"summary": "历史公告补充说明", "version": "2.1"})
    verify(edited.status_code == 200 and current_version()["latest_version"] == "3.0", "Editing older release does not overwrite newer current version")
    verify(edited.json()["published_at"] == old["published_at"], "Editing preserves original publication timestamp")
    publish(create_update("pg-smoke-backfill", version="1.5", official_release_date="2025-12-01"))
    verify(current_version()["latest_version"] == "3.0", "Newly backfilled older official release does not roll version backward")
    demo = publish(create_update("pg-smoke-demo", version="DEMO-999", official_release_date="2027-01-01", is_demo=True))
    verify(current_version()["latest_version"] == "3.0" and not current_version()["is_demo"], "Demo publication cannot contaminate real software version facts")
    notification = client.get(f"/api/v1/admin/updates/{demo['id']}/notification").json()["text"]
    verify("演示" in notification and "/update/pg-smoke-demo" in notification, "Demo group text includes explicit demo notice and detail URL")
    pinned = publish(create_update("pg-smoke-site-notice", kind="notice", software_id=None, version="", official_release_date=None, official_release_url=None, is_pinned=True))
    publish(create_update("pg-smoke-later-notice", kind="notice", software_id=None, version="", official_release_date=None, official_release_url=None))
    items = client.get("/api/v1/updates", params={"q": "PGSMOKE", "page_size": 100}).json()["items"]
    verify(items[0]["id"] == pinned["id"], "Pinned sitewide notice sorts before later unpinned announcements")
    verify(client.get("/api/v1/updates", params={"q": "PGSMOKE", "software_ids": software_id}).json()["total"] == 4, "Followed-software filter excludes unrelated sitewide notice")
    verify(client.post(f"/api/v1/admin/updates/{newer['id']}/archive").status_code == 200, "Archive preserves administrative announcement history")
    verify(client.get("/api/v1/updates/pg-smoke-new-release").status_code == 404 and client.get(f"/api/v1/admin/updates/{newer['id']}/notification").status_code == 409, "Archived announcement excluded from public detail and group text")
    client.patch(f"/api/v1/admin/updates/{old['id']}", json={"summary": "再次修订旧公告"})
    verify(current_version()["latest_version"] == "3.0", "Archiving current release does not enable older-version rollback")


def history_checks(client):
    """Verify chronological history on PostgreSQL, including a non-UTC session."""
    from app.core.database import SessionLocal, engine
    from app.models import ReleaseUpdate

    response = client.post("/api/v1/admin/software", json={"name": "历史线 PostgreSQL 验证", "slug": "postgres-history-tool", "published": True, "official_links": [{"label": "官方入口", "url": "https://example.com/history", "is_primary": True}]})
    verify(response.status_code == 201, "Create isolated software for PostgreSQL version history")
    software_id = response.json()["id"]
    path = "/api/v1/software/postgres-history-tool/history"
    verify(client.get(path).json()["total"] == 0, "Published software without releases returns empty history")

    def release(slug, version, date, **overrides):
        payload = {"slug": slug, "title": "版本历史验证 " + slug, "summary": "历史日期与查询顺序验证", "content": "独立 PostgreSQL 测试数据，不对应真实发布。", "kind": "release", "software_id": software_id, "version": version, "official_release_date": date, "reason_to_update": "核对版本历史", "who_should_update": "集成测试", **overrides}
        created = client.post("/api/v1/admin/updates", json=payload)
        verify(created.status_code == 201, f"Create history record {slug}")
        item = created.json()
        if payload.get("status") not in {"draft", "review"}:
            published = client.post(f"/api/v1/admin/updates/{item['id']}/publish", json={"confirmed": True})
            verify(published.status_code == 200, f"Publish history record {slug}")
            item = published.json()
        return item

    current = release("pg-history-current", "3.0", "2026-09-21")
    older = release("pg-history-backfill", "2.0", "2026-09-19", is_pinned=True)
    fallback = release("pg-history-undated", "2.5", None)
    release("pg-history-draft", "private-draft", "2026-09-22", status="draft")
    release("pg-history-review", "private-review", "2026-09-22", status="review")
    archived = release("pg-history-archived", "1.9", "2026-09-18")
    verify(client.post(f"/api/v1/admin/updates/{archived['id']}/archive").status_code == 200, "Archive fixture excluded from release history")
    release("pg-history-notice", "", None, kind="notice")
    release("pg-history-maintenance", "", None, kind="maintenance")

    def shanghai_timezone(dbapi_connection, _):
        # The cluster and all data are dedicated to this script. Set only newly
        # opened application connections, then remove the listener after checks.
        with dbapi_connection.cursor() as cursor:
            cursor.execute("SET TIME ZONE 'Asia/Shanghai'")
        dbapi_connection.commit()

    event.listen(engine, "connect", shanghai_timezone)
    engine.dispose()
    try:
        with SessionLocal() as db:
            verify(db.execute(text("SHOW TimeZone")).scalar_one() == "Asia/Shanghai", "PostgreSQL history tested with Asia/Shanghai connection timezone")
            # Deliberately make first publication order conflict with release date.
            db.get(ReleaseUpdate, current["id"]).published_at = datetime(2026, 9, 18, tzinfo=timezone.utc)
            db.get(ReleaseUpdate, fallback["id"]).published_at = datetime(2026, 9, 20, 23, 30, tzinfo=timezone.utc)
            db.commit()
        before_version = client.get(f"/api/v1/admin/software/{software_id}").json()["latest_version"]
        timeline = client.get(path).json()
        verify(timeline["total"] == 3 and [row["id"] for row in timeline["items"]] == [current["id"], fallback["id"], older["id"]], "History uses official date or UTC publication day, ignoring pins and later backfill")
        verify(timeline["items"][1]["published_at"] == "2026-09-20T23:30:00Z", "Non-UTC PostgreSQL session still serializes publication instant in UTC")
        verify(all(row["kind"] == "release" and row["status"] == "published" and row["software_id"] == software_id for row in timeline["items"]), "History excludes notice, maintenance, draft, review, archive and other software")
        first = client.get(path, params={"page": 1, "page_size": 2}).json()
        second = client.get(path, params={"page": 2, "page_size": 2}).json()
        verify(first["total"] == second["total"] == 3 and [row["id"] for row in first["items"]] == [current["id"], fallback["id"]] and [row["id"] for row in second["items"]] == [older["id"]], "PostgreSQL history pagination retains total and chronological boundaries")
        verify(client.get(path, params={"page": 3, "page_size": 2}).json()["items"] == [], "Out-of-range history page remains an empty standard page")
        verify(client.get(path, params={"page_size": 101}).status_code == 422, "History page-size bound enforced")
        verify(client.get(f"/api/v1/admin/software/{software_id}").json()["latest_version"] == before_version, "Reading history never changes persisted current version")
        verify(client.get("/api/v1/software/missing-history-software/history").status_code == 404, "Missing software history returns 404")
        verify(client.delete(f"/api/v1/admin/software/{software_id}").status_code == 200 and client.get(path).status_code == 404, "Unpublished software history returns 404")
    finally:
        event.remove(engine, "connect", shanghai_timezone)
        engine.dispose()


def explicit_history_checks(client):
    created = client.post("/api/v1/admin/software", json={"name": "显式历史补录验证", "slug": "pg-explicit-history", "published": True, "official_links": [{"label": "官方入口", "url": "https://example.com/explicit-history", "is_primary": True}]})
    verify(created.status_code == 201, "Create explicit-history PostgreSQL fixture")
    software_id = created.json()["id"]

    def create_update(slug, **overrides):
        response = client.post("/api/v1/admin/updates", json={"slug": slug, "title": "显式版本工作流 " + slug, "kind": "release", "software_id": software_id, "version": "3.0", "summary": "验证补录不会影响当前版本", "content": "PostgreSQL 独立测试数据。", "reason_to_update": "核对当前版本建议", "who_should_update": "测试成员", "official_release_date": "2026-09-20", **overrides})
        verify(response.status_code == 201, f"Save explicit version fixture {slug}")
        return response.json()

    current = create_update("pg-explicit-current")
    verify(client.post(f"/api/v1/admin/updates/{current['id']}/publish", json={"confirmed": True}).status_code == 200, "Publish normal version establishes current pointer")
    before = client.get(f"/api/v1/admin/software/{software_id}").json()
    verify(before["current_release_id"] == current["id"] and client.get("/api/v1/software/pg-explicit-history/current-release").json()["id"] == current["id"], "Public current release resolves persisted matching pointer")
    history = create_update("pg-explicit-same-day", version="1.0", is_historical=True, update_level="hold")
    verify(client.post(f"/api/v1/admin/updates/{history['id']}/publish", json={"confirmed": True}).status_code == 200, "Publish same-day historical backfill")
    after = client.get(f"/api/v1/admin/software/{software_id}").json()
    verify(all(after[field] == before[field] for field in ("latest_version", "update_level", "update_reason", "is_demo", "current_release_id", "updated_at")), "Historical publication does not alter any current version facts or pointer")
    verify(client.patch(f"/api/v1/admin/updates/{history['id']}", json={"is_historical": False}).status_code == 409, "Historical classification immutable after first publication")
    undated = create_update("pg-explicit-undated", version="0.9", is_historical=True, official_release_date=None)
    verify(client.post(f"/api/v1/admin/updates/{undated['id']}/publish", json={"confirmed": True}).status_code == 422, "Undated historical record can be saved but cannot be published")
    default_feed = client.get("/api/v1/updates", params={"software_id": software_id}).json()
    inclusive_feed = client.get("/api/v1/updates", params={"software_id": software_id, "include_historical": "true"}).json()
    verify(default_feed["total"] == 1 and inclusive_feed["total"] == 2, "Public feed excludes historical backfills unless explicitly requested")
    verify(client.get("/api/v1/software/pg-explicit-history/history").json()["total"] == 2, "Version history still includes published backfills")
    admin_history = client.get(f"/api/v1/admin/software/{software_id}/history").json()
    verify(admin_history["total"] == 3 and client.get(f"/api/v1/admin/software/{software_id}/history?status=draft").json()["total"] == 1, "Administrative version history includes all states with filtering")
    shared = client.get(f"/api/v1/admin/updates/{history['id']}/notification").json()["text"]
    verify(shared.startswith("历史版本记录 · 非当前更新建议"), "Historical shared notification cannot masquerade as current advice")
    verify(client.post(f"/api/v1/admin/updates/{current['id']}/archive").status_code == 200, "Archive current fixture")
    archived = client.get(f"/api/v1/admin/software/{software_id}").json()
    verify(archived["current_release_id"] == current["id"] and archived["latest_version"] == "3.0" and client.get("/api/v1/software/pg-explicit-history/current-release").json() is None, "Archive retains version provenance but does not disclose archived current content")
    verify(client.post(f"/api/v1/admin/updates/{current['id']}/publish", json={"confirmed": True}).status_code == 200, "Explicit republish restores current release visibility")
    verify(client.patch(f"/api/v1/admin/software/{software_id}", json={"latest_version": "manual-4"}).status_code == 200 and client.get("/api/v1/software/pg-explicit-history/current-release").json() is None, "Manual current facts mismatch returns null rather than a guessed current announcement")
    verify(client.patch(f"/api/v1/admin/updates/{current['id']}", json={"title": "仅修改公告文字"}).status_code == 200 and client.get(f"/api/v1/admin/software/{software_id}").json()["latest_version"] == "manual-4", "Editing published prose cannot overwrite independently maintained current facts")


def api_checks():
    from fastapi.testclient import TestClient
    from PIL import Image
    from app.main import app
    from app.core.database import SessionLocal, engine
    from app.models import Software

    with TestClient(app) as client:
        verify(client.get("/ready").status_code == 200, "PostgreSQL readiness after migration")
        catalog = client.get("/api/v1/software?page_size=100").json()
        verify(catalog["total"] == 12, "Repeated seed retains exactly 12 published records")
        verify(all(s["is_demo"] for s in catalog["items"]), "Seed demonstration labels persisted")
        verify(client.get("/api/v1/software", params={"q": "蓝色代码编辑器"}).json()["items"][0]["slug"] == "vscode", "Chinese alias search on PostgreSQL")
        verify(client.get("/api/v1/admin/software").status_code == 401, "Unauthorized administrative read blocked")
        login = client.post("/api/v1/admin/auth/login", json={"email": os.environ["ADMIN_INITIAL_EMAIL"], "password": admin_password})
        verify(login.status_code == 200, "CLI-created administrator can log in")
        verify(client.post("/api/v1/admin/categories", json={"name": "PG测试", "slug": "pg-test"}).status_code == 403, "CSRF required on authenticated write")
        client.headers["X-CSRF-Token"] = login.json()["csrf_token"]
        category = client.post("/api/v1/admin/categories", json={"name": "PG测试", "slug": "pg-test", "sort_order": 0})
        verify(category.status_code == 201, "Create category")
        category_id = category.json()["id"]
        payload = {"name": "PostgreSQL 集成测试工具", "slug": "postgres-integration-tool", "summary": "真实数据库的发布与下线测试", "category_id": category_id, "platforms": ["windows", "linux"], "tags": ["集成"], "purposes": ["验证数据库"], "aliases": ["PG验证工具"], "published": False, "official_links": [{"label": "官方入口", "url": "https://example.com/tool", "type": "website", "is_active": True, "is_primary": True}]}
        created = client.post("/api/v1/admin/software", json=payload)
        verify(created.status_code == 201, "Create draft with platform/tag/alias/link relations")
        item = created.json()
        item_id, link_id = item["id"], item["official_links"][0]["id"]
        verify(client.get("/api/v1/software/postgres-integration-tool").status_code == 404, "Draft detail remains private")
        verify(client.get(f"/go/{link_id}", follow_redirects=False).status_code == 404, "Draft official link remains private")
        edited = client.patch(f"/api/v1/admin/software/{item_id}", json={"published": True, "platforms": ["windows", "macos"], "latest_version": "PG-verified", "official_links": [{"id": link_id, "label": "修改后的官方入口", "url": "https://example.com/new", "type": "website", "is_primary": True, "is_active": True}]})
        verify(edited.status_code == 200, "Publish and replace relations retaining official-link ID")
        verify(client.get("/api/v1/software", params={"q": "PG验证工具", "platform": "macos", "category": "pg-test"}).json()["total"] == 1, "Combined PostgreSQL alias/platform/category filters")
        redirect = client.get(f"/go/{link_id}", follow_redirects=False)
        verify(redirect.status_code == 302 and redirect.headers["location"] == "https://example.com/new", "Published official redirect uses stored URL")
        verify(client.delete(f"/api/v1/admin/categories/{category_id}").status_code == 409, "Foreign-key-linked category deletion blocked")
        verify(client.post("/api/v1/admin/software", json=payload).status_code == 409, "PostgreSQL duplicate slug conflict mapped to HTTP409")
        for field in ("tags", "purposes"):
            verify(client.patch(f"/api/v1/admin/software/{item_id}", json={field: ["x" * 81]}).status_code == 422, f"{field} length rejected before PostgreSQL VARCHAR(80)")
        png = io.BytesIO()
        Image.new("RGB", (32, 32), "teal").save(png, format="PNG")
        upload = client.post("/api/v1/admin/uploads/icon", files={"file": ("icon.png", png.getvalue(), "image/png")})
        verify(upload.status_code == 201, "Icon upload and PostgreSQL audit persisted")
        audit = client.get("/api/v1/admin/audit").json()
        verify(any(a["action"] == "update" and a["resource_id"] == item_id for a in audit["items"]), "Software update visible in audit log")
        with SessionLocal() as db:
            stored = db.get(Software, item_id)
            verify(stored.published and set(stored.platforms) == {"windows", "macos"} and stored.official_links[0].url == "https://example.com/new", "Persisted relational state matches API response")
        announcement_checks(client, item_id)
        history_checks(client)
        explicit_history_checks(client)
        verify(client.delete(f"/api/v1/admin/software/{item_id}").status_code == 200, "Soft unpublish succeeds")
        verify(client.get("/api/v1/software/postgres-integration-tool").status_code == 404, "Unpublished detail hidden immediately")
        verify(client.get(f"/go/{link_id}", follow_redirects=False).status_code == 404, "Unpublished redirect hidden immediately")
        verify(client.get("/api/v1/updates/pg-smoke-old-release").status_code == 404 and client.get("/api/v1/software/postgres-integration-tool/updates").status_code == 404, "Software unpublish hides associated public announcements")
        verify(client.post("/api/v1/admin/auth/logout").status_code == 200, "Logout revokes session")
        verify(client.get("/api/v1/admin/auth/me").status_code == 401, "Revoked session cannot authenticate")
    engine.dispose()


with tempfile.TemporaryDirectory(prefix="updatehub-pg-test-") as uploads:
    os.environ.update(ENVIRONMENT="test", PUBLIC_SITE_URL="http://localhost:3000", UPLOAD_DIR=uploads, ADMIN_INITIAL_EMAIL="pg-smoke@example.com", ADMIN_INITIAL_PASSWORD=admin_password, PYTHONIOENCODING="utf-8")
    sys.path.insert(0, str(API_ROOT))
    migration_compatibility()
    maintenance("alembic", "check")
    maintenance("app.cli", "seed")
    maintenance("app.cli", "seed")
    maintenance("app.cli", "create-admin")
    api_checks()
    maintenance("alembic", "downgrade", "base")
    maintenance("alembic", "upgrade", "head")
    maintenance("alembic", "check")
print(f"POSTGRESQL API SMOKE: {checks} checks passed; migration roundtrip passed")
