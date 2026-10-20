"""Security regressions use disposable databases; never attack the daily preview."""
import os
import subprocess
import sys

import pytest
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from tests.test_station import ADMIN, PUBLIC


def production(**overrides):
    return Settings(_env_file=None, **{
        "environment": "production", "database_url": "postgresql+psycopg://test@db/test",
        "public_site_url": "https://station.example.test", "cors_origins": "",
        "station_signing_key": "security-fixture-signing-key-at-least-32-chars", **overrides,
    })


@pytest.mark.parametrize("value", ["https://", "https:///broken", "https://user:private-fixture@example.test", "https://example.test/path", "https://example.test?token=private-fixture", "https://example.test#fragment", "https://example.test\\path", "https://[broken", "http://example.test"])
def test_production_rejects_ambiguous_origins_without_leaking_settings(value):
    with pytest.raises(ValidationError) as error:
        production(public_site_url=value)
    assert "private-fixture" not in str(error.value)
    assert "security-fixture-signing" not in str(error.value)


@pytest.mark.parametrize("value", ["https://", "https://mini.example.test/", "https://*.example.test/app/", "http://mini.example.test/app/", "https://mini.example.test/app", "https://mini.example.test/app/?x=1", "https://user:secret@mini.example.test/app/"])
def test_native_referer_allowlist_requires_specific_https_app_path(value):
    with pytest.raises(ValidationError):
        production(miniapp_referer_prefixes=value)


def test_production_origins_and_native_prefixes_accept_precise_configuration():
    settings = production(cors_origins="https://admin.example.test", miniapp_referer_prefixes="https://servicewechat.com/wx-fixture/,https://mini.example.test/xhs-fixture/")
    assert settings.allowed_origins == ["https://station.example.test", "https://admin.example.test"]
    with pytest.raises(ValidationError):
        production(cors_origins="*")


@pytest.mark.parametrize("referer", ["https://[broken", "https://localhost:invalid/", "http://user:secret@localhost:3000/", "http://localhost:3000\\@evil.example.test/", "http://localhost:3000.evil.example.test/"])
def test_malformed_and_spoofed_referers_return_403_not_server_errors(client, referer):
    response = client.post(PUBLIC + "/events", json={"events": []}, headers={"Referer": referer})
    assert response.status_code == 403
    assert "secret" not in response.text


def test_native_allowlist_does_not_accept_another_app_or_host(client, monkeypatch):
    monkeypatch.setenv("MINIAPP_REFERER_PREFIXES", "https://mini.example.test/allowed-app/")
    get_settings.cache_clear()
    for referer in ["https://mini.example.test/other-app/", "https://mini.example.test/allowed-app-spoof/", "https://mini.example.test.evil.test/allowed-app/"]:
        assert client.post(PUBLIC + "/events", json={"events": []}, headers={"Referer": referer}).status_code == 403
    assert client.post(PUBLIC + "/events", json={"events": [{"event": "page_view", "key": "home"}]}, headers={"Referer": "https://mini.example.test/allowed-app/0/page"}).status_code == 204


def test_management_routes_require_session_and_csrf_and_cannot_be_mass_assigned(client, admin):
    # admin and client share a fixture; temporarily remove credentials for the visitor matrix.
    cookies = dict(client.cookies)
    token = client.headers.pop("X-CSRF-Token")
    client.cookies.clear()
    for path in ["/data", "/dashboard", "/feedback", "/wishes"]:
        assert client.get(ADMIN + path).status_code == 401
    for path in ["/software", "/releases", "/releases/batch", "/announcements", "/promotions"]:
        assert client.post(ADMIN + path, json={}).status_code == 401
    assert client.patch(ADMIN + "/settings", json={}).status_code == 401
    client.cookies.update(cookies)
    assert client.patch(ADMIN + "/settings", json={"site_name": "安全检查"}).status_code == 403
    client.headers["X-CSRF-Token"] = token
    assert client.patch(ADMIN + "/settings", json={"site_name": "安全检查"}, headers={"Origin": "https://evil.example.test"}).status_code == 403
    assert client.patch(ADMIN + "/settings", json={"site_name": "安全检查", "admin_user_id": "attacker"}).status_code == 422


def test_disguised_html_svg_and_oversized_images_rejected(admin):
    for body in [b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', b'<html><script>alert(1)</script></html>']:
        assert admin.post(ADMIN + "/uploads", files={"file": ("picture.png", body, "image/png")}).status_code == 422
    assert admin.post(ADMIN + "/uploads", files={"file": ("picture.png", b"x" * (5 * 1024 * 1024 + 1), "image/png")}).status_code == 413


def test_negative_content_length_is_rejected_before_parsing(client):
    assert client.post(PUBLIC + "/events", content=b"{}", headers={"Content-Length": "-1", "Content-Type": "application/json"}).status_code == 400


def test_production_does_not_register_openapi_or_documentation(tmp_path):
    env = {**os.environ, "ENVIRONMENT": "production", "DATABASE_URL": "postgresql+psycopg://test@db/test", "PUBLIC_SITE_URL": "https://station.example.test", "CORS_ORIGINS": "", "MINIAPP_REFERER_PREFIXES": "", "STATION_SIGNING_KEY": "security-fixture-signing-key-at-least-32-chars", "UPLOAD_DIR": str(tmp_path / "uploads")}
    result = subprocess.run([sys.executable, "-c", "from app.main import app; assert not {'/openapi.json','/docs','/redoc'} & {r.path for r in app.routes}"], env=env, capture_output=True, text=True, encoding="utf-8")
    assert result.returncode == 0, "Production route registration check failed"


def test_fresh_install_and_admin_creation_do_not_seed_content(client):
    env = {**os.environ, "ADMIN_INITIAL_EMAIL": "fresh-admin@example.test", "ADMIN_INITIAL_PASSWORD": "isolated-fixture-password-not-production"}
    result = subprocess.run([sys.executable, "-m", "app.cli", "create-admin"], env=env, capture_output=True, text=True, encoding="utf-8")
    assert result.returncode == 0, "Isolated administrator creation failed"
    data = client.get(PUBLIC + "/data").json()
    assert all(data[key] == [] for key in ["software", "releases", "announcements", "promotions"])
    assert data["settings"]["ads_enabled"] is False
    assert client.get(PUBLIC + "/software/guangmu").status_code == 404
