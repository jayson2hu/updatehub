import io
from datetime import datetime, timedelta, timezone

import pytest
from PIL import Image
from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import SESSION_COOKIE, WindowRateLimiter, hash_token
from app.models import AdminSession, AuditLog, OfficialLink, Software
from app.models.entities import utcnow
from app.schemas.catalog import AuditRead, OfficialLinkRead, SoftwareRead
from app.seed import seed


def software_payload(**overrides):
    return {"name": "Example editor", "slug": "example-editor", "summary": "Edit source files", "aliases": ["蓝色代码编辑器", "VS Code"], "purposes": ["写代码"], "tags": ["开发"], "platforms": ["windows", "macos"], "published": True, "official_links": [{"label": "官方网站", "url": "https://example.com/", "type": "website", "is_primary": True}], **overrides}


def create(admin, **overrides):
    response = admin.post("/api/v1/admin/software", json=software_payload(**overrides))
    assert response.status_code == 201, response.text
    return response.json()


def test_auth_csrf_cookie_and_revocation(client, database):
    assert client.get("/api/v1/admin/software").status_code == 401
    assert client.post("/api/v1/admin/auth/login", headers={"Origin": "https://evil.example"}, json={"email": "admin@example.com", "password": "test-admin-password-123"}).status_code == 403
    response = client.post("/api/v1/admin/auth/login", json={"email": "ADMIN@example.com", "password": "test-admin-password-123"})
    assert response.status_code == 200
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=strict" in cookie and "Path=/api/v1/admin" in cookie
    token = client.cookies.get(SESSION_COOKIE)
    with database() as db:
        stored = db.scalar(select(AdminSession))
        assert stored.token_hash == hash_token(token) and stored.token_hash != token
    assert client.post("/api/v1/admin/software", json=software_payload()).status_code == 403
    csrf = response.json()["csrf_token"]
    assert client.post("/api/v1/admin/software", json=software_payload(), headers={"X-CSRF-Token": csrf, "Origin": "https://evil.example"}).status_code == 403
    assert client.get("/api/v1/admin/auth/me").json()["csrf_token"] == csrf
    assert client.post("/api/v1/admin/auth/logout", headers={"X-CSRF-Token": csrf}).status_code == 200
    client.cookies.set(SESSION_COOKIE, token, path="/api/v1/admin")
    assert client.get("/api/v1/admin/auth/me").status_code == 401


def test_expired_session(admin, database):
    with database() as db:
        session = db.scalar(select(AdminSession))
        session.expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    assert admin.get("/api/v1/admin/auth/me").status_code == 401


def test_software_crud_search_audit_and_unpublish(admin):
    category = admin.post("/api/v1/admin/categories", json={"name": "开发编程", "slug": "development"}).json()
    item = create(admin, category_id=category["id"])
    for query in ["蓝色代码编辑器", "VS CODE", "写代码", "开发", "source"]:
        page = admin.get("/api/v1/software", params={"q": query}).json()
        assert page["total"] == 1
        assert page["items"][0]["id"] == item["id"]
    assert admin.get("/api/v1/software?platform=linux").json()["total"] == 0
    assert admin.get("/api/v1/software?category=development").json()["total"] == 1
    assert admin.get("/api/v1/software?page_size=0").status_code == 422
    assert admin.delete(f"/api/v1/admin/categories/{category['id']}").status_code == 409
    old_link = item["official_links"][0]
    updated = admin.patch(f"/api/v1/admin/software/{item['id']}", json={"name": "Revised editor", "aliases": ["新名称"], "platforms": ["windows", "linux"], "official_links": [{"id": old_link["id"], "label": "官方新入口", "url": "https://example.com/new", "is_primary": True}]} )
    assert updated.status_code == 200, updated.text
    assert updated.json()["official_links"][0]["id"] == old_link["id"]
    assert admin.get("/api/v1/search?q=新名称").json()["total"] == 1
    assert admin.get("/api/v1/search?q=蓝色代码编辑器").json()["total"] == 0
    logs = admin.get("/api/v1/admin/audit").json()["items"]
    audit = next(log for log in logs if log["action"] == "update" and log["resource_type"] == "software")
    assert audit["payload"]["before"]["name"] == "Example editor"
    assert audit["payload"]["after"]["name"] == "Revised editor"
    assert "password" not in str(logs)
    assert admin.delete(f"/api/v1/admin/software/{item['id']}").status_code == 200
    assert admin.get("/api/v1/software/example-editor").status_code == 404
    assert admin.get("/api/v1/software").json()["total"] == 0
    assert admin.get(f"/api/v1/admin/software/{item['id']}").json()["published"] is False


def test_drafts_redirects_and_link_ownership(admin, database):
    published = create(admin)
    draft = create(admin, name="Draft", slug="draft", published=False)
    active_link = published["official_links"][0]["id"]
    draft_link = draft["official_links"][0]["id"]
    assert admin.get("/api/v1/software/draft").status_code == 404
    assert admin.get(f"/go/{draft_link}", follow_redirects=False).status_code == 404
    redirect = admin.get(f"/go/{active_link}", follow_redirects=False)
    assert redirect.status_code == 302 and redirect.headers["location"] == "https://example.com/"
    assert admin.get(f"/go/{active_link}?url=https://evil.example", follow_redirects=False).status_code == 400
    assert admin.get("/go/unknown", follow_redirects=False).status_code == 404
    assert admin.patch(f"/api/v1/admin/software/{published['id']}", json={"official_links": [{"id": draft_link, "label": "Stolen", "url": "https://example.com/"}]}).status_code == 422
    with database() as db:
        db.get(OfficialLink, active_link).is_active = False
        db.commit()
    assert admin.get(f"/go/{active_link}", follow_redirects=False).status_code == 404


def test_duplicate_slugs_and_publication_rules(admin):
    item = create(admin)
    assert admin.post("/api/v1/admin/software", json=software_payload()).status_code == 409
    assert admin.post("/api/v1/admin/software", json=software_payload(slug="no-links", official_links=[])).status_code == 422
    assert admin.patch(f"/api/v1/admin/software/{item['id']}", json={"official_links": []}).status_code == 422
    assert len(admin.get("/api/v1/software/example-editor").json()["official_links"]) == 1


def test_icon_decode_reencode_and_rejections(admin):
    stream = io.BytesIO()
    Image.new("RGB", (80, 80), "red").save(stream, format="PNG")
    upload = admin.post("/api/v1/admin/uploads/icon", files={"file": ("../../fake.svg", stream.getvalue(), "image/svg+xml")})
    assert upload.status_code == 201
    path = get_settings().upload_dir / upload.json()["url"].split("/")[-1]
    with Image.open(path) as image:
        assert image.format == "PNG" and image.size == (80, 80)
    assert admin.post("/api/v1/admin/uploads/icon", files={"file": ("fake.png", b"<svg onload='alert(1)'/>", "image/png")}).status_code == 422
    assert admin.post("/api/v1/admin/uploads/icon", files={"file": ("huge.png", b"x" * (2 * 1024 * 1024 + 1), "image/png")}).status_code == 413


def test_login_rate_limit_and_bounded_storage(client):
    for _ in range(10):
        assert client.post("/api/v1/admin/auth/login", json={"email": "admin@example.com", "password": "wrong"}).status_code == 401
    assert client.post("/api/v1/admin/auth/login", json={"email": "admin@example.com", "password": "wrong"}).status_code == 429
    limiter = WindowRateLimiter(max_keys=2)
    limiter.hit("a")
    limiter.hit("b")
    with pytest.raises(Exception) as error:
        limiter.hit("c")
    assert error.value.status_code == 429 and len(limiter.entries) == 2


def test_request_body_limit_precedes_multipart_parsing(client):
    response = client.post("/api/v1/admin/uploads/icon", content=b"x" * (3 * 1024 * 1024 + 1), headers={"Content-Type": "multipart/form-data; boundary=example"})
    assert response.status_code == 413
    response = client.post("/api/v1/admin/auth/login", content=b"x" * (1024 * 1024 + 1), headers={"Content-Type": "application/json"})
    assert response.status_code == 413


def test_production_cookie_is_secure(client, monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://updatehub@db/updatehub")
    monkeypatch.setenv("PUBLIC_SITE_URL", "https://example.com")
    get_settings.cache_clear()
    response = client.post("/api/v1/admin/auth/login", json={"email": "admin@example.com", "password": "test-admin-password-123"})
    assert response.status_code == 200
    assert "Secure" in response.headers["set-cookie"]
    get_settings.cache_clear()


def test_seed_idempotence_health_and_search(client, database):
    with database() as db:
        assert seed(db) == 12
        assert seed(db) == 0
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/ready").json() == {"status": "ready"}
    records = client.get("/api/v1/software?page_size=100").json()
    assert records["total"] == 12
    assert all(item["is_demo"] and item["latest_version"].startswith("DEMO") for item in records["items"])
    assert client.get("/api/v1/search?q=蓝色代码编辑器").json()["items"][0]["slug"] == "vscode"
    assert client.get("/api/v1/search?q=压缩文件").json()["items"][0]["slug"] == "7zip"


def test_sqlite_timestamps_serialize_as_same_instant_as_aware_datetimes(admin, database):
    item = create(admin)
    naive_utc = datetime(2026, 9, 22, 6, 30)
    shanghai_time = datetime(2026, 9, 22, 14, 30, tzinfo=timezone(timedelta(hours=8)))
    expected = "2026-09-22T06:30:00Z"
    with database() as db:
        software = db.get(Software, item["id"])
        software.created_at = software.updated_at = naive_utc
        software.official_links[0].last_checked_at = naive_utc
        audit = db.scalar(select(AuditLog).where(AuditLog.resource_id == item["id"]))
        audit.created_at = naive_utc
        audit_id = audit.id
        db.commit()
        db.refresh(software)
        assert software.created_at.tzinfo is None  # Exercise SQLite's actual output.
    response = admin.get("/api/v1/software/example-editor").json()
    audit_response = next(row for row in admin.get("/api/v1/admin/audit").json()["items"] if row["id"] == audit_id)
    assert response["created_at"] == response["updated_at"] == expected
    assert response["official_links"][0]["last_checked_at"] == expected
    assert audit_response["created_at"] == expected
    assert datetime.fromisoformat(response["updated_at"]).astimezone(shanghai_time.tzinfo) == shanghai_time
    # PostgreSQL-style aware values normalize to identical JSON, retaining instant.
    aware_software = SoftwareRead.model_validate({**response, "created_at": shanghai_time, "updated_at": shanghai_time})
    aware_link = OfficialLinkRead.model_validate({**response["official_links"][0], "last_checked_at": shanghai_time})
    aware_audit = AuditRead.model_validate({**audit_response, "created_at": shanghai_time})
    assert aware_software.model_dump(mode="json")["created_at"] == expected
    assert aware_software.model_dump(mode="json")["updated_at"] == expected
    assert aware_link.model_dump(mode="json")["last_checked_at"] == expected
    assert aware_audit.model_dump(mode="json")["created_at"] == expected
