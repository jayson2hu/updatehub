"""Station production-mode API and real PostgreSQL dump/restore, isolated only.

Run with tests/portable-postgres.mjs --station. No live deployment or TLS test.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps/api"
URL = make_url(os.environ.get("DATABASE_URL", "sqlite://"))
if URL.drivername != "postgresql+psycopg" or URL.host not in {"localhost", "127.0.0.1"} or not re.fullmatch(r"updatehub_test_[a-z0-9_]+", URL.database or ""):
    raise SystemExit("Refusing nonlocal or non-test PostgreSQL database.")


def client_app():
    sys.path.insert(0, str(API))
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app, base_url=os.environ["PUBLIC_SITE_URL"], headers={"Origin": os.environ["PUBLIC_SITE_URL"]})


def authenticated(client):
    response = client.post("/api/v1/admin/auth/login", json={"email": os.environ["ADMIN_INITIAL_EMAIL"], "password": os.environ["ADMIN_INITIAL_PASSWORD"]})
    assert response.status_code == 200, "Test administrator login failed"
    assert "secure" in response.headers["set-cookie"].lower()
    client.headers["X-CSRF-Token"] = response.json()["csrf_token"]


if "--verify-restored" in sys.argv:
    expected = json.loads(os.environ["PG_STATION_EXPECTED"])
    with client_app() as client:
        assert client.get("/ready").status_code == 200
        assert client.get("/api/v1/admin/station/data").status_code == 401
        detail = client.get("/api/v1/station/software/pg-station-fixture").json()
        assert len(detail["releases"]) == 2
        assert hashlib.sha256(client.get(expected["image"]).content).hexdigest() == expected["image_sha256"]
        assert client.get("/api/v1/station/sync-codes/" + expected["sync_code"]).status_code == 200
        revoked = client.post("/api/v1/station/feedback/vote", json={"release_id": expected["release_id"], "verdict": "none", "receipt": expected["receipt"]})
        assert revoked.status_code == 200 and revoked.json()["issues"] == 0
        authenticated(client)
        assert client.get("/api/v1/admin/station/data").status_code == 200
    print("RESTORED_STATION_API_PASSED")
    raise SystemExit(0)

source = create_engine(URL)
with source.connect() as connection:
    schemas = connection.execute(text("SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema','pg_catalog','pg_toast') AND schema_name NOT LIKE 'pg_temp_%' AND schema_name NOT LIKE 'pg_toast_temp_%'"))
    for (schema,) in schemas:
        if inspect(connection).get_table_names(schema=schema) or inspect(connection).get_view_names(schema=schema):
            raise SystemExit("Refusing nonempty database before any writes.")

run_dir = ROOT / "runtime/pg" / ("station-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + secrets.token_hex(3))
uploads = run_dir / "uploads"
uploads.mkdir(parents=True)
os.environ.update(ENVIRONMENT="production", PUBLIC_SITE_URL="https://station.example.test", CORS_ORIGINS="https://station.example.test", UPLOAD_DIR=str(uploads), ADMIN_INITIAL_EMAIL="pg-station@example.test", ADMIN_INITIAL_PASSWORD=secrets.token_urlsafe(32), STATION_SIGNING_KEY=secrets.token_urlsafe(48), PYTHONIOENCODING="utf-8")
report = {"status": "running", "mode": "native PostgreSQL, production API settings, TestClient HTTPS URL; no TLS or container deployment", "checks": [], "runtime": str(run_dir.relative_to(ROOT))}
output = ROOT / "artifacts/acceptance-20261019/postgres-station.json"
output.parent.mkdir(parents=True, exist_ok=True)


def check(label):
    report["checks"].append(label)
    print("PASS " + label, flush=True)


def run(command, env=None):
    result = subprocess.run(command, cwd=API, env=env or os.environ.copy(), capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode:
        # Never include DSNs, credentials, receipts or response bodies in reports.
        raise RuntimeError(f"{Path(command[0]).name} returned {result.returncode}")
    return result.stdout


def snapshot(engine):
    result = {}
    with engine.connect() as connection:
        for name in inspect(connection).get_table_names():
            assert re.fullmatch(r"[a-z0-9_]+", name)
            rows = [json.dumps(dict(row), sort_keys=True, ensure_ascii=False, default=str) for row in connection.execute(text(f'SELECT * FROM "{name}"')).mappings()]
            result[name] = {"count": len(rows), "sha256": hashlib.sha256("\n".join(sorted(rows)).encode()).hexdigest()}
    return result


def send(client, method, path, body=None, expected=200):
    response = client.request(method, "/api/v1" + path, json=body)
    assert response.status_code == expected, f"{method} {path}: unexpected status {response.status_code}"
    return response.json() if response.content else None


try:
    run([sys.executable, "-m", "alembic", "upgrade", "head"])
    run([sys.executable, "-m", "alembic", "downgrade", "-1"])
    run([sys.executable, "-m", "alembic", "upgrade", "head"])
    run([sys.executable, "-m", "app.cli", "seed-station"])
    run([sys.executable, "-m", "app.cli", "seed-station"])
    run([sys.executable, "-m", "app.cli", "create-admin"])
    with source.connect() as connection:
        report["revision"] = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    check("PostgreSQL migrations upgrade/downgrade/upgrade and repeatable station seed")
    with client_app() as client:
        assert client.get("/ready").status_code == 200
        initial = send(client, "GET", "/station/data")
        assert len(initial["software"]) >= 6 and len(initial["releases"]) >= 8 and len(initial["announcements"]) >= 4
        assert not initial["settings"]["wechat_inapp_hint"]
        assert client.get("/api/v1/software").status_code == 410
        assert client.get("/api/v1/admin/station/data").status_code == 401
        authenticated(client)
        assert client.patch("/api/v1/admin/station/settings", json={"site_name": "不应保存"}, headers={"X-CSRF-Token": "wrong"}).status_code == 403
        check("Production settings, Secure session, authorization, CSRF and legacy retirement")
        from PIL import Image
        buffer = io.BytesIO()
        Image.new("RGB", (80, 80), "#245bdd").save(buffer, "PNG")
        image = client.post("/api/v1/admin/station/uploads", files={"file": ("pg-image.png", buffer.getvalue(), "image/png")})
        assert image.status_code == 201
        image_url = image.json()["url"]
        software = send(client, "POST", "/admin/station/software", {"slug": "pg-station-fixture", "name": "数据库验收播放器", "summary": "独立 PostgreSQL 验收内容", "platforms": ["android", "tv"], "icon_url": image_url, "published": False}, 201)
        assert client.get("/api/v1/station/software/pg-station-fixture").status_code == 404
        send(client, "PATCH", "/admin/station/software/" + software["id"], {"published": True})
        batch = [{"software_id": software["id"], "platform": p, "version": "1.0", "summary": "保留中文说明与各设备独立入口。", "published": True, "links": [{"label": "官方测试入口", "url": f"https://downloads.example.test/{p}/1.0", "kind": "official"}]} for p in ["android", "tv"]]
        releases = send(client, "POST", "/admin/station/releases/batch", {"releases": batch}, 201)
        bad = [{**batch[0], "version": "bad-batch"}, {**batch[1], "platform": "ios", "version": "bad-batch"}]
        send(client, "POST", "/admin/station/releases/batch", {"releases": bad}, 422)
        detail = send(client, "GET", "/station/software/pg-station-fixture")
        assert len(detail["releases"]) == 2
        assert all(r["links"][0]["url"].endswith(f"/{r['platform']}/1.0") for r in detail["releases"])
        check("Chinese software draft/publish, real upload, multi-platform links and atomic batch rollback")
        notice = send(client, "POST", "/admin/station/announcements", {"slug": "pg-notice", "title": "安装前先备份", "summary": "数据库验收公告", "body": "先备份配置，再安装对应版本。", "published": True, "pinned": True, "importance": "important", "software_ids": [software["id"]]}, 201)
        assert send(client, "GET", "/station/announcements/pg-notice")["effective_pinned"]
        send(client, "PATCH", "/admin/station/announcements/" + notice["id"], {"expires_at": (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()})
        ended = send(client, "GET", "/station/announcements/pg-notice")
        assert ended["expired"] and not ended["effective_pinned"]
        check("PostgreSQL announcement association, pinning and expiry")
        vote = send(client, "POST", "/station/feedback/vote", {"release_id": releases[0]["id"], "verdict": "issue"})
        sync = send(client, "POST", "/station/sync-codes", {"software_ids": [software["id"]], "device": "tv"}, 201)
        expected = {"image": image_url, "image_sha256": hashlib.sha256(client.get(image_url).content).hexdigest(), "receipt": vote["receipt"], "release_id": releases[0]["id"], "sync_code": sync["code"]}

    before = snapshot(source)
    client_bin = Path(os.environ.get("UPDATEHUB_PG_CLIENT_BIN", ROOT / "runtime/pg-client/bin"))
    suffix = ".exe" if os.name == "nt" else ""
    pg_dump, pg_restore = [str(client_bin / (name + suffix)) for name in ["pg_dump", "pg_restore"]]
    assert all(Path(p).is_file() for p in [pg_dump, pg_restore]), "PostgreSQL backup clients unavailable"
    pg_env = {**os.environ, "PGHOST": URL.host, "PGPORT": str(URL.port or 5432), "PGUSER": URL.username, "PGPASSWORD": URL.password, "PGDATABASE": URL.database}
    dump = run_dir / "station.dump"
    run([pg_dump, "--format=custom", "--file", str(dump)], pg_env)
    restore_name = "updatehub_test_station_restore_" + secrets.token_hex(5)
    admin_engine = create_engine(URL.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as connection:
        connection.execute(text(f'CREATE DATABASE "{restore_name}"'))
    run([pg_restore, "--no-owner", "--exit-on-error", "--dbname", restore_name, str(dump)], pg_env)
    restored = create_engine(URL.set(database=restore_name))
    assert snapshot(restored) == before, "Restored table data differs"
    report["table_count"] = len(before)
    report["backup_sha256"] = hashlib.sha256(dump.read_bytes()).hexdigest()
    check("Native pg_dump/pg_restore into a new database; all table counts and row hashes match")
    with restored.begin() as connection:
        connection.execute(text("DELETE FROM admin_session"))
    restored_uploads = run_dir / "restored-uploads"
    shutil.copytree(uploads, restored_uploads)
    assert {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in uploads.iterdir() if p.is_file()} == {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in restored_uploads.iterdir() if p.is_file()}
    child_env = {**os.environ, "DATABASE_URL": URL.set(database=restore_name).render_as_string(hide_password=False), "UPLOAD_DIR": str(restored_uploads), "PG_STATION_EXPECTED": json.dumps(expected)}
    assert "RESTORED_STATION_API_PASSED" in run([sys.executable, str(Path(__file__).resolve()), "--verify-restored"], child_env)
    check("Restored application in a fresh process: data/image, sync code, signed feedback and administrator login")
    source.dispose()
    restored.dispose()
    admin_engine.dispose()
    report["status"] = "passed"
except Exception as error:
    report["status"] = "failed"
    report["error_type"] = type(error).__name__
    print("STATION_POSTGRES_FAILED: " + type(error).__name__, flush=True)
finally:
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
if report["status"] != "passed":
    raise SystemExit(1)
