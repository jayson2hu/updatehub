import os
import subprocess
import sys
import uuid
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError
from sqlalchemy import Boolean, Date, DateTime, JSON, MetaData, String, Table, inspect, select, text

from app.core.config import Settings
from app.core.database import build_engine


def test_sqlite_file_engine_uses_wal_and_waits_for_writers(tmp_path):
    engine = build_engine("sqlite:///" + str(tmp_path / "pragmas.db").replace("\\", "/"))
    with engine.connect() as connection:
        assert connection.execute(text("PRAGMA journal_mode")).scalar() == "wal"
        assert connection.execute(text("PRAGMA busy_timeout")).scalar() == 5000
        assert connection.execute(text("PRAGMA foreign_keys")).scalar() == 1
    engine.dispose()


def test_alembic_roundtrip_and_schema_alignment(tmp_path):
    url = "sqlite:///" + str(tmp_path / "roundtrip.db").replace("\\", "/")
    env = {**os.environ, "PYTHONIOENCODING": "utf-8", "DATABASE_URL": url, "ENVIRONMENT": "development"}
    for args in [("upgrade", "head"), ("check",), ("downgrade", "base"), ("upgrade", "head")]:
        result = subprocess.run([sys.executable, "-m", "alembic", *args], env=env, capture_output=True, text=True, encoding="utf-8")
        assert result.returncode == 0, result.stdout + result.stderr
    engine = build_engine(url)
    names = inspect(engine).get_table_names()
    assert {"software", "category", "software_alias", "official_link", "admin_session", "audit_log"}.issubset(names)
    with engine.connect() as connection:
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
    engine.dispose()


def test_postgresql_migration_compiles_without_connection():
    env = {**os.environ, "PYTHONIOENCODING": "utf-8", "DATABASE_URL": "postgresql+psycopg://updatehub@localhost/updatehub_test", "ENVIRONMENT": "development"}
    result = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head", "--sql"], env=env, capture_output=True, text=True, encoding="utf-8")
    assert result.returncode == 0, result.stderr
    assert "CREATE TABLE software" in result.stdout
    assert "TIMESTAMP WITH TIME ZONE" in result.stdout


def test_production_configuration_requires_persistent_database_and_https(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(ValidationError):
        Settings(environment="production", public_site_url="https://example.com", _env_file=None)
    for url in ["sqlite:///local.db", "sqlite://", "sqlite:///:memory:", "sqlite:///file:station?mode=memory&uri=true", "mysql://app@db/app"]:
        with pytest.raises(ValidationError):
            Settings(environment="production", database_url=url, public_site_url="https://example.com", cors_origins="", station_signing_key="test-signing-key-is-32-characters-minimum", _env_file=None)
    for url in ["sqlite:////data/station.db", "sqlite:///C:/station/station.db"]:
        assert Settings(environment="production", database_url=url, public_site_url="https://example.com", cors_origins="", station_signing_key="test-signing-key-is-32-characters-minimum", _env_file=None).production
    with pytest.raises(ValidationError):
        Settings(environment="production", database_url="postgresql+psycopg://app@db/app", public_site_url="http://example.com", _env_file=None)
    with pytest.raises(ValidationError):
        Settings(environment="production", database_url="postgresql+psycopg://app@db/app", public_site_url="https://example.com", _env_file=None)
    assert Settings(environment="production", database_url="postgresql+psycopg://app@db/app", public_site_url="https://example.com", cors_origins="", station_signing_key="test-signing-key-is-32-characters-minimum", _env_file=None).allowed_origins == ["https://example.com"]


def test_current_release_migration_backfills_only_unambiguous_matching_facts(tmp_path):
    url = "sqlite:///" + str(tmp_path / "backfill.db").replace("\\", "/")
    env = {**os.environ, "PYTHONIOENCODING": "utf-8", "DATABASE_URL": url, "ENVIRONMENT": "development"}

    def migrate(revision):
        result = subprocess.run([sys.executable, "-m", "alembic", "upgrade", revision], env=env, capture_output=True, text=True, encoding="utf-8")
        assert result.returncode == 0, result.stdout + result.stderr

    migrate("d9e4582f723c")
    engine = build_engine(url)
    metadata = MetaData()
    software_table = Table("software", metadata, autoload_with=engine)
    update_table = Table("release_update", metadata, autoload_with=engine)
    instant = datetime(2026, 9, 21, 6, 30, tzinfo=timezone.utc)

    def defaults(table):
        row = {}
        for column in table.columns:
            if column.nullable:
                row[column.name] = None
            elif isinstance(column.type, DateTime):
                row[column.name] = instant
            elif isinstance(column.type, Date):
                row[column.name] = instant.date()
            elif isinstance(column.type, Boolean):
                row[column.name] = False
            elif isinstance(column.type, JSON):
                row[column.name] = []
            else:
                row[column.name] = ""
        row["id"] = str(uuid.uuid4())
        return row

    expected = {}
    with engine.begin() as connection:
        def sample(slug, *, ambiguous=False, mismatch=False, archived=False, is_demo=False):
            app = {**defaults(software_table), "slug": slug, "name": slug, "published": True, "latest_version": "manual" if mismatch else "3.0", "update_level": "recommended", "update_reason": "建议先验证", "is_demo": is_demo}
            connection.execute(software_table.insert().values(**app))
            announcement = {**defaults(update_table), "slug": slug + "-release", "title": slug, "kind": "release", "software_id": app["id"], "version": "3.0", "update_level": "recommended", "reason_to_update": "建议先验证", "is_demo": is_demo, "status": "archived" if archived else "published", "published_at": instant, "official_release_date": instant.date()}
            connection.execute(update_table.insert().values(**announcement))
            if ambiguous:
                connection.execute(update_table.insert().values(**{**announcement, "id": str(uuid.uuid4()), "slug": slug + "-duplicate"}))
            expected[app["id"]] = None if ambiguous or mismatch else announcement["id"]
            return app, announcement

        sample("unique")
        sample("ambiguous", ambiguous=True)
        sample("manual", mismatch=True)
        sample("archived", archived=True)
        demo_app, _ = sample("demo-vscode", is_demo=True)
        historic = {**defaults(update_table), "slug": "demo-vscode-release-1-1", "title": "演示历史", "kind": "release", "software_id": demo_app["id"], "version": "2.0", "is_demo": True, "status": "published", "published_at": instant, "official_release_date": datetime(2026, 9, 20).date()}
        connection.execute(update_table.insert().values(**historic))
    engine.dispose()
    migrate("head")
    engine = build_engine(url)
    with engine.connect() as connection:
        rows = connection.execute(text("SELECT id, current_release_id, latest_version FROM software")).mappings().all()
        assert {row["id"]: row["current_release_id"] for row in rows} == expected
        assert any(row["latest_version"] == "manual" for row in rows)
        assert connection.execute(text("SELECT is_historical FROM release_update WHERE id=:id"), {"id": historic["id"]}).scalar() == 1
    engine.dispose()
