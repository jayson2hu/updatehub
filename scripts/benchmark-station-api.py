"""Local SQLite timing at 50 software / 500 published releases, isolated data."""
import json
import os
import sqlite3
import statistics
import sys
import time
from pathlib import Path

root = Path(__file__).resolve().parents[1]
folder = root / "runtime" / "performance-20261019"
folder.mkdir(parents=True, exist_ok=True)
database = folder / "performance.db"
with sqlite3.connect(root / "runtime" / "station.db") as source, sqlite3.connect(database) as target:
    source.backup(target)
os.environ.update(DATABASE_URL="sqlite:///" + database.as_posix(), UPLOAD_DIR=str(folder / "uploads"), ENVIRONMENT="development", LEGACY_ENABLED="false")
sys.path.insert(0, str(root / "apps" / "api"))
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from app.core.database import SessionLocal
from app.main import app
from app.models.entities import utcnow
from app.models.station import StationRelease, StationSoftware

with SessionLocal() as db:
    count = db.scalar(select(func.count()).select_from(StationSoftware))
    for i in range(count, 50):
        db.add(StationSoftware(slug=f"performance-{i}", name=f"性能样本软件 {i}", summary="用于隔离库性能测试", platforms=["android", "tv", "ios", "desktop"], published=True))
    db.flush()
    software = list(db.scalars(select(StationSoftware)))
    count = db.scalar(select(func.count()).select_from(StationRelease))
    for i in range(count, 500):
        item = software[i % len(software)]
        db.add(StationRelease(software_id=item.id, platform=item.platforms[i % len(item.platforms)], version=f"1.{i}.0", summary="修复部分设备启动后黑屏的问题，优化安装过程。", notes="本次更新修复了已知问题。\n" * 8, published=True, published_at=utcnow()))
    db.commit()

samples = []
with TestClient(app) as client:
    assert client.get("/api/v1/station/data").status_code == 200
    for _ in range(40):
        start = time.perf_counter()
        response = client.get("/api/v1/station/data")
        assert response.status_code == 200
        samples.append((time.perf_counter() - start) * 1000)
    payload = response.json()
assert len(payload["software"]) == 50 and len(payload["releases"]) == 500
result = {"backend": "local SQLite + FastAPI TestClient (not deployed load test)", "software": 50, "releases": 500, "requests": len(samples), "p50_ms": round(statistics.median(samples), 1), "p95_ms": round(sorted(samples)[37], 1), "budget_ms": 300}
result["passed"] = result["p95_ms"] <= 300
out = root / "artifacts" / "acceptance-20261019" / "api-performance.json"
out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(result, ensure_ascii=False, indent=2))
assert result["passed"], "本机接口 P95 超出 300ms 预算"
