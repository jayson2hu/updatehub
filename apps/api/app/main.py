import logging
import time
from pathlib import Path

from alembic.script import ScriptDirectory
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api import admin, analytics, content, public, station, updates
from app.api.dependencies import Database
from app.core.config import get_settings
from app.core.middleware import BodySizeLimitMiddleware
from app.schemas.catalog import HealthRead
from app.services.retention import lifespan

settings = get_settings()
app = FastAPI(title="UpdateHub API", version="0.1.0", lifespan=lifespan, docs_url=None if settings.production else "/docs", redoc_url=None if settings.production else "/redoc")
app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_credentials=True, allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"], allow_headers=["Content-Type", "X-CSRF-Token"])
app.add_middleware(BodySizeLimitMiddleware)
logger = logging.getLogger("updatehub")
schema_heads = frozenset(ScriptDirectory(str(Path(__file__).resolve().parents[1] / "migrations")).get_heads())


@app.middleware("http")
async def response_headers(request: Request, call_next):
    start = time.monotonic()
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers["X-Frame-Options"] = "DENY"
    if request.url.path.startswith("/api/v1/admin"):
        response.headers["Cache-Control"] = "no-store"
    if settings.production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    # No query strings, passwords, cookies or tokens in application logs.
    logger.info("request method=%s path=%s status=%s duration_ms=%.1f", request.method, request.url.path, response.status_code, (time.monotonic() - start) * 1000)
    return response


@app.get("/health", response_model=HealthRead, tags=["health"])
@app.get("/api/v1/health", response_model=HealthRead, tags=["health"])
def health():
    return HealthRead(status="ok")


@app.get("/ready", response_model=HealthRead, tags=["health"])
@app.get("/api/v1/ready", response_model=HealthRead, tags=["health"])
def ready(db: Database):
    try:
        db.execute(text("SELECT 1"))
        applied = frozenset(db.execute(text("SELECT version_num FROM alembic_version")).scalars())
        if applied != schema_heads:
            raise HTTPException(503, "数据库迁移版本与应用不一致")
    except SQLAlchemyError as exc:
        raise HTTPException(503, "数据库或迁移尚未就绪") from exc
    return HealthRead(status="ready")


app.include_router(public.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(updates.router, prefix="/api/v1")
app.include_router(updates.admin_router, prefix="/api/v1")
app.include_router(updates.admin_history_router, prefix="/api/v1")
app.include_router(content.router, prefix="/api/v1")
app.include_router(content.admin_router, prefix="/api/v1")
app.include_router(analytics.router, prefix="/api/v1")
app.include_router(station.router, prefix="/api/v1")
app.include_router(station.admin_router, prefix="/api/v1")
app.include_router(public.redirect_router, prefix="/api/v1")
app.include_router(public.redirect_router)
settings.upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")
