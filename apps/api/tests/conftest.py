import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./test-bootstrap.db")
os.environ.setdefault("ENVIRONMENT", "development")

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.database import build_engine, get_db
from app.core.security import STATION_LIMITERS, login_limiter, password_hasher, public_limiter
from app.main import app
from app.models import AdminUser


@pytest.fixture
def database(tmp_path, monkeypatch):
    url = "sqlite:///" + str(tmp_path / "test.db").replace("\\", "/")
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    get_settings.cache_clear()
    command.upgrade(Config("alembic.ini"), "head")
    engine = build_engine(url)
    maker = sessionmaker(bind=engine, expire_on_commit=False)
    with maker() as db:
        db.add(AdminUser(email="admin@example.com", password_hash=password_hasher.hash("test-admin-password-123")))
        db.commit()
    yield maker
    engine.dispose()
    get_settings.cache_clear()


@pytest.fixture
def client(database):
    def override_db():
        with database() as db:
            yield db
    app.dependency_overrides[get_db] = override_db
    login_limiter.entries.clear()
    public_limiter.entries.clear()
    for limiter in STATION_LIMITERS:
        limiter.entries.clear()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def admin(client):
    response = client.post("/api/v1/admin/auth/login", json={"email": "admin@example.com", "password": "test-admin-password-123"})
    assert response.status_code == 200, response.text
    client.headers["X-CSRF-Token"] = response.json()["csrf_token"]
    return client
