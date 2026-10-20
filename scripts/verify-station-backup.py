"""Restore a trusted local backup into a NEW isolated directory and read it.

Does not overwrite live data, print credentials, or start a public service.
"""
import argparse
import hashlib
import json
import os
import secrets
import sqlite3
import sys
import zipfile
from pathlib import Path, PurePosixPath

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--archive", type=Path, required=True)
args = parser.parse_args()
target = root / "runtime" / "restore-checks" / secrets.token_hex(6)
target.mkdir(parents=True, exist_ok=False)
with zipfile.ZipFile(args.archive) as archive:
    for entry in archive.infolist():
        relative = PurePosixPath(entry.filename.replace("\\", "/"))
        if relative.is_absolute() or ".." in relative.parts or ":" in entry.filename:
            raise ValueError("备份包含不安全的路径，停止恢复")
        if entry.external_attr >> 16 & 0o170000 == 0o120000:
            raise ValueError("备份含符号链接，停止恢复")
    archive.extractall(target)
manifest = json.loads((target / "manifest.json").read_text(encoding="utf-8"))
database = target / "station.db"
assert hashlib.sha256(database.read_bytes()).hexdigest() == manifest["database_sha256"], "数据库校验值不一致"
with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as connection:
    assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    revision = connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]
files = [p for p in (target / "station-uploads").rglob("*") if p.is_file()]
assert len(files) == manifest["uploaded_files"]
key = target / "station-signing.key"
assert key.is_file() == manifest.get("local_signing_key_included", False)
if key.is_file():
    assert len(key.read_text(encoding="ascii").strip()) >= 32
os.environ.update({"DATABASE_URL": "sqlite:///" + database.as_posix(), "UPLOAD_DIR": str(target / "station-uploads"), "ENVIRONMENT": "development", "LEGACY_ENABLED": "false", "PUBLIC_SITE_URL": "http://localhost:3012"})
os.environ.pop("STATION_SIGNING_KEY", None)
sys.path.insert(0, str(root / "apps/api"))
from fastapi.testclient import TestClient
from app.main import app

with TestClient(app) as client:
    assert client.get("/ready").status_code == 200
    response = client.get("/api/v1/station/data")
    assert response.status_code == 200
    data = response.json()
    assert data["software"] and data["releases"] and data["announcements"]
    for item in data["software"]:
        assert client.get("/api/v1/station/software/" + item["slug"]).status_code == 200
    for path in files:
        response = client.get("/uploads/" + path.relative_to(target / "station-uploads").as_posix())
        assert response.status_code == 200 and response.content == path.read_bytes()
report = {"passed": True, "archive": args.archive.name, "restored_to": str(target.relative_to(root)), "revision": revision, "software": len(data["software"]), "releases": len(data["releases"]), "uploaded_images": len(files), "local_signing_key_included": key.is_file(), "checks": ["restore to a new isolated directory", "database SHA-256 and integrity", "migration readiness", "restored public software and announcements", "all uploaded image bytes served", "local signing key included"]}
output = root / "artifacts" / "acceptance-20261019" / "backup-restore.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=False))
