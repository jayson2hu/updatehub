"""Real pg_dump/pg_restore drill on a NEW EMPTY local updatehub_test_* database.

Requires PostgreSQL 17 clients on PATH, or UPDATEHUB_PG_CLIENT_BIN. This verifies
native database and upload recovery; Docker wrapper execution is tested in CI.
Never accepts a production/nonlocal database or overwrites an existing database.
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
import tarfile
import tempfile
import time

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps/api"
URL = make_url(os.environ.get("DATABASE_URL", "sqlite://"))
if URL.drivername != "postgresql+psycopg" or URL.host not in {"localhost", "127.0.0.1", "::1"} or not re.fullmatch(r"updatehub_test_[a-z0-9_]+", URL.database or ""):
    raise SystemExit("Use a new isolated local postgresql+psycopg updatehub_test_* database.")
checks = []


def verify(condition, message):
    if not condition:
        raise AssertionError(message)
    checks.append(message)
    print("PASS", message)


def run(command, *, cwd=API, env=None):
    result = subprocess.run(command, cwd=cwd, env=env or os.environ.copy(), capture_output=True, text=True, encoding="utf-8")
    if result.returncode:
        output = result.stderr
        for secret in (URL.password, os.environ.get("ADMIN_INITIAL_PASSWORD")):
            if secret:
                output = output.replace(secret, "[redacted]")
        raise RuntimeError(f"{Path(command[0]).name} failed: {output}")
    return result.stdout


def snapshot(engine):
    result = {}
    with engine.connect() as connection:
        for name in inspect(connection).get_table_names():
            if not re.fullmatch(r"[a-z0-9_]+", name):
                raise RuntimeError("Unexpected table identifier")
            rows = [json.dumps(dict(row), sort_keys=True, ensure_ascii=False, default=str) for row in connection.execute(text(f'SELECT * FROM "{name}"')).mappings()]
            result[name] = {"count": len(rows), "sha256": hashlib.sha256("\n".join(sorted(rows)).encode()).hexdigest()}
    return result


def verify_restored():
    sys.path.insert(0, str(API))
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as client:
        assert client.get("/ready").status_code == 200
        catalog = client.get("/api/v1/software?page_size=100").json()
        assert catalog["total"] == 12
        assert client.get("/api/v1/software/vscode").status_code == 200
        assert client.get("/api/v1/updates").json()["total"] > 0
        assert client.get("/api/v1/guides").json()["total"] > 0
        assert client.get("/api/v1/collections").json()["total"] > 0
        assert client.get("/api/v1/faq").json()["total"] > 0
        assert client.get("/uploads/restore-fixture.png").status_code == 200
        restored = client.post("/api/v1/admin/auth/login", json={"email": os.environ["ADMIN_INITIAL_EMAIL"], "password": os.environ["ADMIN_INITIAL_PASSWORD"]})
        assert restored.status_code == 200
        assert client.get("/api/v1/admin/audit").json()["total"] > 0
    print("RESTORED_APPLICATION_VERIFIED")


if "--verify-restored" in sys.argv:
    verify_restored()
    raise SystemExit(0)

source = create_engine(URL)
with source.connect() as connection:
    schemas = connection.execute(text("SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast') AND schema_name NOT LIKE 'pg_temp_%' AND schema_name NOT LIKE 'pg_toast_temp_%'"))
    for (schema,) in schemas:
        inspector = inspect(connection)
        if inspector.get_table_names(schema=schema) or inspector.get_view_names(schema=schema):
            raise SystemExit("Refusing nonempty database before any changes.")

client_dir = Path(os.environ.get("UPDATEHUB_PG_CLIENT_BIN", ROOT / "runtime/pg-client/bin"))


def utility(name):
    local = client_dir / (name + (".exe" if os.name == "nt" else ""))
    result = str(local) if local.is_file() else shutil.which(name)
    if not result:
        raise SystemExit(f"Install PostgreSQL 17 {name}, or set UPDATEHUB_PG_CLIENT_BIN.")
    return result


pg_dump, pg_restore = utility("pg_dump"), utility("pg_restore")
started = time.monotonic()
restore_name = "updatehub_test_restore_" + secrets.token_hex(6)
restore_url = URL.set(database=restore_name)
admin_url = URL.set(database="postgres")
admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
report = {"passed": False, "checks": checks, "mode": "native PostgreSQL clients; Docker wrappers not executed", "source_database": URL.database, "restore_database": restore_name}
try:
    with tempfile.TemporaryDirectory(prefix="updatehub-recovery-") as folder:
        temporary = Path(folder)
        uploads = temporary / "uploads"
        uploads.mkdir()
        os.environ.update(ENVIRONMENT="test", PUBLIC_SITE_URL="http://localhost:3000", UPLOAD_DIR=str(uploads), ADMIN_INITIAL_EMAIL="restore-test@example.test", ADMIN_INITIAL_PASSWORD=secrets.token_urlsafe(32), PYTHONIOENCODING="utf-8")
        run([sys.executable, "-m", "alembic", "upgrade", "head"])
        run([sys.executable, "-m", "app.cli", "seed"])
        run([sys.executable, "-m", "app.cli", "seed-content"])
        run([sys.executable, "-m", "app.cli", "create-admin"])
        sys.path.insert(0, str(API))
        from fastapi.testclient import TestClient
        from PIL import Image
        from app.main import app
        with TestClient(app) as client:
            login = client.post("/api/v1/admin/auth/login", json={"email": os.environ["ADMIN_INITIAL_EMAIL"], "password": os.environ["ADMIN_INITIAL_PASSWORD"]})
            verify(login.status_code == 200, "Source administrator authenticated before backup")
            image_bytes = io.BytesIO()
            Image.new("RGB", (20, 20), "teal").save(image_bytes, format="PNG")
            uploaded = client.post("/api/v1/admin/uploads/icon", files={"file": ("fixture.png", image_bytes.getvalue(), "image/png")}, headers={"X-CSRF-Token": login.json()["csrf_token"]})
            verify(uploaded.status_code == 201, "Source uploaded icon and audit record persisted")
            # Fixed additional fixture allows the independent recovered app check.
            (uploads / "restore-fixture.png").write_bytes(image_bytes.getvalue())
        before = snapshot(source)
        verify(before["admin_session"]["count"] > 0, "Backup contains a session to test explicit revocation")
        dump, archive = temporary / "database.dump", temporary / "uploads.tar.gz"
        client_env = {**os.environ, "PGHOST": URL.host, "PGPORT": str(URL.port or 5432), "PGUSER": URL.username, "PGPASSWORD": URL.password, "PGDATABASE": URL.database}
        run([pg_dump, "--format=custom", "--file", str(dump)], env=client_env)
        with tarfile.open(archive, "w:gz") as tar:
            tar.add(uploads, arcname=".")
        hashes = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in (dump, archive)}
        verify(all(path.stat().st_size > 0 and hashlib.sha256(path.read_bytes()).hexdigest() == hashes[path.name] for path in (dump, archive)), "Database and upload backups are nonempty and match SHA-256 manifest")
        with admin_engine.connect() as connection:
            connection.execute(text(f'CREATE DATABASE "{restore_name}"'))
        run([pg_restore, "--no-owner", "--exit-on-error", "--dbname", restore_name, str(dump)], env=client_env)
        restored = create_engine(restore_url)
        verify(snapshot(restored) == before, "Every restored table count and row digest matches the backup source")
        verify("alembic_version" in before and before["software"]["count"] == 12, "Schema revision and seeded software recovered")
        with restored.begin() as connection:
            connection.execute(text("DELETE FROM admin_session"))
        verify(snapshot(restored)["admin_session"]["count"] == 0, "Recovered sessions explicitly revoked before application verification")
        restored.dispose()
        restored_uploads = temporary / "restored-uploads"
        restored_uploads.mkdir()
        with tarfile.open(archive) as tar:
            tar.extractall(restored_uploads, filter="data")
        original_files = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in uploads.iterdir()}
        recovered_files = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in restored_uploads.iterdir()}
        verify(original_files == recovered_files, "All uploaded image bytes restored to a separate directory")
        result = run([sys.executable, str(Path(__file__).resolve()), "--verify-restored"], cwd=ROOT, env={**os.environ, "DATABASE_URL": restore_url.render_as_string(hide_password=False), "UPLOAD_DIR": str(restored_uploads)})
        verify("RESTORED_APPLICATION_VERIFIED" in result, "Recovered application passes readiness, catalog, detail, announcements, uploads, administrator login and audit read")
        verify(snapshot(source) == before, "Recovery and session revocation did not alter the source database")
        report.update(passed=True, tables=before, uploaded_file_count=len(original_files), backup_checksums=hashes)
finally:
    source.dispose()
    admin_engine.dispose()
    report["duration_seconds"] = round(time.monotonic() - started, 2)
    out = ROOT / "artifacts"
    out.mkdir(exist_ok=True)
    (out / "postgres-restore-result.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "tables"}, ensure_ascii=False, indent=2))
