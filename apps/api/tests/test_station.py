import io
from datetime import datetime, timedelta, timezone

import pytest
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.database import build_engine
from app.models.station import StationPromotion, StationRelease, StationReleaseLink, StationSettings, StationSoftware
from app.seed_station import seed_station

ADMIN = "/api/v1/admin/station"
PUBLIC = "/api/v1/station"


def software(admin, **overrides):
    payload = {"name": "测试播放器", "slug": "test-player", "summary": "测试简介", "aliases": ["播放器", "player"], "platforms": ["android", "tv"], "published": True}
    payload.update(overrides)
    response = admin.post(ADMIN + "/software", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def release(admin, app, **overrides):
    payload = {"software_id": app["id"], "platform": "android", "version": "1.0", "summary": "修复字幕显示", "notes": "修复字幕问题。\n保留用户收藏。", "published": False, "links": [{"label": "示例来源", "url": "https://example.com/android.apk", "code": "1234", "is_primary": True}]}
    payload.update(overrides)
    response = admin.post(ADMIN + "/releases", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def notice(admin, **overrides):
    payload = {"slug": "test-notice", "title": "测试公告", "summary": "请先看安装步骤", "body": "第一段说明。\n\n第二段说明。", "pinned": True, "published": True, "importance": "important"}
    payload.update(overrides)
    response = admin.post(ADMIN + "/announcements", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_station_seed_idempotent_fictitious_and_current(client, database):
    with database() as db:
        assert seed_station(db) == {"software": 9, "releases": 17, "announcements": 4}
        assert seed_station(db) == {"software": 0, "releases": 0, "announcements": 0}
    data = client.get(PUBLIC + "/data").json()
    assert len(data["software"]) == 9 and len(data["releases"]) == 17 and len(data["announcements"]) == 4
    assert all(item["is_demo"] for item in data["software"] + data["announcements"])
    assert all(not item["links"] for item in data["releases"])
    assert not data["settings"]["ads_enabled"] and data["promotions"] == []
    assert sum(item["effective_pinned"] for item in data["announcements"]) == 1
    assert sum(item["expired"] for item in data["announcements"]) == 1
    assert {item["status"] for item in data["software"]} == {"normal", "attention", "unavailable"}
    assert client.get(PUBLIC + "/software/guangmu").status_code == 200


def test_station_admin_auth_and_csrf(client):
    assert client.get(ADMIN + "/data").status_code == 401
    assert client.post(ADMIN + "/software", json={}).status_code == 401
    assert client.patch(ADMIN + "/settings", json={"site_name": "侵入"}).status_code == 401
    assert client.post(ADMIN + "/promotions", json={}).status_code == 401
    signed = client.post("/api/v1/admin/auth/login", json={"email": "admin@example.com", "password": "test-admin-password-123"})
    assert signed.status_code == 200
    assert client.get(ADMIN + "/data").status_code == 200
    assert client.post(ADMIN + "/software", json={}).status_code == 403
    client.headers["X-CSRF-Token"] = signed.json()["csrf_token"]
    assert client.patch(ADMIN + "/settings", json={"site_name": "侵入"}, headers={"Origin": "https://attacker.example"}).status_code == 403


def test_station_draft_publish_edit_preserves_history_and_platform_links(admin):
    app = software(admin)
    draft = release(admin, app)
    assert draft["published_at"] is None
    assert admin.get(PUBLIC + "/software/test-player").json()["releases"] == []
    assert len(admin.get(ADMIN + "/data").json()["releases"]) == 1
    published = admin.patch(ADMIN + "/releases/" + draft["id"], json={"published": True}).json()
    assert published["published_at"] is not None
    edited = admin.patch(ADMIN + "/releases/" + draft["id"], json={"summary": "补充安装说明"}).json()
    assert edited["published_at"] == published["published_at"]
    tv = release(admin, app, platform="tv", version="8.1", published=True, links=[{"label": "电视来源", "url": "https://example.com/tv.apk", "is_primary": True}])
    newer = release(admin, app, version="1.1", published=True, links=[{"label": "安卓新版", "url": "https://example.com/android-new.apk", "is_primary": True}])
    detail = admin.get(PUBLIC + "/software/test-player").json()
    assert len(detail["releases"]) == 3
    by_id = {item["id"]: item for item in detail["releases"]}
    assert by_id[tv["id"]]["platform"] == "tv" and by_id[tv["id"]]["links"][0]["url"].endswith("tv.apk")
    assert by_id[draft["id"]]["version"] == "1.0" and by_id[draft["id"]]["links"][0]["code"] == "1234"
    assert detail["releases"][0]["id"] == newer["id"]
    hidden = software(admin, name="私有软件", slug="private-app", published=False)
    release(admin, hidden, published=True)
    assert admin.get(PUBLIC + "/software/private-app").status_code == 404
    public = admin.get(PUBLIC + "/data").json()
    assert all(item["software_id"] != hidden["id"] for item in public["releases"])
    assert admin.patch(ADMIN + "/software/" + app["id"], json={"published": False}).status_code == 200
    assert admin.get(PUBLIC + "/software/test-player").status_code == 404
    assert admin.get(PUBLIC + "/data").json()["releases"] == []


def test_station_announcement_links_expiry_drafts_and_withdrawal(admin):
    app = software(admin)
    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    live = notice(admin, expires_at=future, software_ids=[app["id"]], links=[{"label": "安装帮助", "url": "https://example.com/help"}])
    assert live["effective_pinned"] is True and live["expired"] is False
    assert admin.get(PUBLIC + "/software/test-player").json()["announcements"][0]["id"] == live["id"]
    ended = admin.patch(ADMIN + "/announcements/" + live["id"], json={"expires_at": past}).json()
    assert ended["pinned"] is True and ended["expired"] is True and ended["effective_pinned"] is False
    assert admin.get(PUBLIC + "/announcements/test-notice").json()["expired"] is True
    draft = notice(admin, slug="hidden-notice", published=False)
    assert admin.get(PUBLIC + "/announcements/hidden-notice").status_code == 404
    assert all(row["id"] != draft["id"] for row in admin.get(PUBLIC + "/data").json()["announcements"])
    assert admin.patch(ADMIN + "/announcements/" + live["id"], json={"published": False}).status_code == 200
    assert admin.get(PUBLIC + "/announcements/test-notice").status_code == 404
    assert admin.get(PUBLIC + "/software/test-player").json()["announcements"] == []


def test_station_validation_prevents_cross_platform_or_cross_version_links(admin):
    app = software(admin)
    android = release(admin, app)
    tv = release(admin, app, platform="tv")
    assert admin.patch(ADMIN + "/releases/" + tv["id"], json={"links": android["links"]}).status_code == 422
    assert admin.patch(ADMIN + "/releases/" + tv["id"], json={"platform": "android"}).status_code == 422
    assert admin.post(ADMIN + "/releases", json={"software_id": app["id"], "platform": "ios", "version": "1"}).status_code == 422
    assert admin.patch(ADMIN + "/software/" + app["id"], json={"platforms": ["android"]}).status_code == 422
    assert admin.post(ADMIN + "/software", json={"slug": app["slug"], "name": "重复"}).status_code == 409
    assert admin.post(ADMIN + "/software", json={"slug": "bad-image", "name": "无效图片", "icon_url": "/uploads/../../secret"}).status_code == 422
    assert admin.patch(ADMIN + "/software/" + app["id"], json={"name": ""}).status_code == 422
    assert admin.patch(ADMIN + "/software/" + app["id"], json={"unknown": True}).status_code == 422
    assert admin.patch(ADMIN + "/software/" + app["id"], json={"slug": "changed-link"}).status_code == 422
    shared_notice = notice(admin)
    assert admin.patch(ADMIN + "/announcements/" + shared_notice["id"], json={"slug": "changed-notice"}).status_code == 422
    assert admin.post(ADMIN + "/announcements", json={"slug": "bad-reference", "title": "无效关联", "software_ids": ["missing"]}).status_code == 422
    assert admin.get(PUBLIC + "/software/test-player").json()["software"]["name"] == app["name"]


@pytest.mark.parametrize("url", ["javascript:alert(1)", "data:text/html,test", "//evil.example/path", "https://example.com\\@evil.example/", "https://user:password@example.com", "https://example.com/a\nb", "http://"])
def test_station_rejects_unsafe_urls(admin, url):
    app = software(admin)
    response = admin.post(ADMIN + "/releases", json={"software_id": app["id"], "platform": "tv", "version": "1", "links": [{"label": "入口", "url": url}]})
    assert response.status_code == 422
    response = admin.post(ADMIN + "/announcements", json={"slug": "unsafe", "title": "链接测试", "links": [{"label": "链接", "url": url}]})
    assert response.status_code == 422


def test_station_upload_pixels_metadata_and_database_survive_reopen(admin, database):
    source = io.BytesIO()
    Image.new("RGB", (2600, 1300), "#245bdd").save(source, "PNG")
    result = admin.post(ADMIN + "/uploads", files={"file": ("screenshot.png", source.getvalue(), "image/png")})
    assert result.status_code == 201, result.text
    url = result.json()["url"]
    path = get_settings().upload_dir / url.rsplit("/", 1)[1]
    with Image.open(path) as image:
        assert image.size == (2400, 1200)
        assert image.format == "PNG"
        assert not image.info
    app = software(admin, icon_url=url, screenshots=[url])
    version = release(admin, app, published=True)
    notice(admin, images=[url], software_ids=[app["id"]])
    assert admin.patch(ADMIN + "/settings", json={"site_name": "重启后的小站"}).status_code == 200
    # Reopen an entirely new database engine, as happens after a service restart.
    engine = build_engine(get_settings().database_url)
    with sessionmaker(bind=engine)() as reopened:
        stored = reopened.get(StationSoftware, app["id"])
        assert stored.icon_url == url and stored.screenshots == [url]
        assert reopened.get(StationRelease, version["id"]).version == "1.0"
        assert reopened.scalar(select(StationReleaseLink)).url.endswith("android.apk")
        assert reopened.get(StationSettings, "site").site_name == "重启后的小站"
    engine.dispose()
    assert path.is_file()
    assert admin.post(ADMIN + "/uploads", files={"file": ("evil.svg", b'<svg onload="alert(1)"></svg>', "image/svg+xml")}).status_code == 422
    assert admin.post(ADMIN + "/uploads", files={"file": ("too-big.png", b"x" * (5 * 1024 * 1024 + 1), "image/png")}).status_code == 413


def test_station_promotions_are_independent_gated_and_expire(admin, database):
    app = software(admin)
    release(admin, app, published=True)
    now = datetime.now(timezone.utc)
    with database() as db:
        for slug, published, end in [("active", True, now + timedelta(days=1)), ("ended", True, now - timedelta(days=1)), ("offline", False, None)]:
            db.add(StationPromotion(slug=slug, title="示例推广", published=published, ends_at=end, target_url="https://example.com/promotion", placements=["home_feed"]))
        db.commit()
    assert admin.get(PUBLIC + "/data").json()["promotions"] == []
    assert admin.get(PUBLIC + "/promo/active").status_code == 404
    admin.patch(ADMIN + "/settings", json={"ads_enabled": True})
    assert [p["slug"] for p in admin.get(PUBLIC + "/data").json()["promotions"]] == ["active"]
    assert admin.get(PUBLIC + "/promo/ended").status_code == 200
    assert admin.get(PUBLIC + "/promo/offline").status_code == 404
    assert admin.get(PUBLIC + "/software/test-player").json()["releases"][0]["links"][0]["url"].endswith("android.apk")
    with database() as db:
        db.add(StationPromotion(slug="invalid-ad", title="无效推广配置", published=True, target_url="javascript:alert(1)", placements=["home_feed"]))
        db.commit()
    unaffected = admin.get(PUBLIC + "/data")
    assert unaffected.status_code == 200
    assert len(unaffected.json()["releases"]) == 1
    assert all(p["slug"] != "invalid-ad" for p in unaffected.json()["promotions"])
    assert admin.get(PUBLIC + "/promo/invalid-ad").status_code == 503


def test_station_validation_messages_are_actionable_chinese(admin):
    cases = [
        ({"slug": "valid"}, "软件名称：请填写此项后重试"),
        ({"slug": "BAD SLUG", "name": "名称"}, "分享链接标识：请使用英文字母、数字和短横线"),
        ({"slug": "valid", "name": "a" * 121}, "软件名称：请缩短至 120 个字符以内"),
        ({"slug": "valid", "name": "名称", "platforms": ["unknown"]}, "支持设备第 1 项：请选择列表中支持的选项"),
        ({"slug": "valid", "name": "名称", "faqs": [{"question": "问题"}]}, "常见问题第 1 项的回答：请填写此项后重试"),
    ]
    for payload, message in cases:
        result = admin.post(ADMIN + "/software", json=payload)
        assert result.status_code == 422
        assert message in result.json()["detail"]
        assert "String should" not in result.json()["detail"]


def test_station_failed_notice_save_preserves_previous_content(admin):
    app = software(admin)
    item = notice(admin, software_ids=[app["id"]])
    failed = admin.patch(ADMIN + "/announcements/" + item["id"], json={"title": "不应保存的标题", "software_ids": ["missing"]})
    assert failed.status_code == 422
    persisted = admin.get(PUBLIC + "/announcements/test-notice").json()
    assert persisted["title"] == item["title"]
    assert persisted["software_ids"] == [app["id"]]


def test_station_promotion_editor_drafts_schedule_security_and_persistence(admin, database):
    app = software(admin)
    version = release(admin, app, published=True)
    payload = {"slug": "new-campaign", "title": "活动测试", "target_url": "https://example.com/activity", "placements": ["home_feed", "detail_body"], "published": False}
    result = admin.post(ADMIN + "/promotions", json=payload)
    assert result.status_code == 201, result.text
    item = result.json()
    assert admin.get(PUBLIC + "/promo/new-campaign").status_code == 404
    assert admin.patch(ADMIN + "/promotions/" + item["id"], json={"target_url": "javascript:alert(1)"}).status_code == 422
    assert admin.patch(ADMIN + "/promotions/" + item["id"], json={"placements": ["download_button"]}).status_code == 422
    now = datetime.now(timezone.utc)
    assert admin.patch(ADMIN + "/promotions/" + item["id"], json={"starts_at": now.isoformat(), "ends_at": (now - timedelta(days=1)).isoformat()}).status_code == 422
    assert admin.patch(ADMIN + "/promotions/" + item["id"], json={"published": True}).status_code == 200
    assert admin.get(PUBLIC + "/data").json()["promotions"] == []
    assert admin.patch(ADMIN + "/settings", json={"ads_enabled": True}).status_code == 200
    assert admin.get(PUBLIC + "/data").json()["promotions"][0]["id"] == item["id"]
    assert admin.patch(ADMIN + "/promotions/" + item["id"], json={"slug": "changed"}).status_code == 422
    with database() as db:
        stored = db.get(StationPromotion, item["id"])
        assert stored.target_url == payload["target_url"] and stored.published
        assert db.get(StationRelease, version["id"]).links[0].url.endswith("android.apk")
    assert admin.patch(ADMIN + "/promotions/" + item["id"], json={"ends_at": (now - timedelta(minutes=1)).isoformat()}).status_code == 200
    assert admin.get(PUBLIC + "/data").json()["promotions"] == []
    assert admin.get(PUBLIC + "/promo/new-campaign").status_code == 200
    assert admin.patch(ADMIN + "/promotions/" + item["id"], json={"published": False}).status_code == 200
    assert admin.get(PUBLIC + "/promo/new-campaign").status_code == 404


def test_station_disabling_old_version_preserves_new_and_other_device(admin):
    app = software(admin)
    old = release(admin, app, published=True)
    new = release(admin, app, version="2.0", published=True, links=[{"label": "新版", "url": "https://example.com/new.apk", "code": "NEW"}])
    tv = release(admin, app, platform="tv", version="5.0", published=True, links=[{"label": "电视", "url": "https://example.com/tv.apk"}])
    assert admin.patch(ADMIN + "/releases/" + old["id"], json={"status": "unavailable", "status_reason": "旧版服务停止"}).status_code == 200
    items = {r["id"]: r for r in admin.get(PUBLIC + "/software/test-player").json()["releases"]}
    assert items[old["id"]]["status"] == "unavailable"
    assert items[new["id"]]["status"] == "normal" and items[new["id"]]["links"][0]["code"] == "NEW"
    assert items[tv["id"]]["links"][0]["url"].endswith("tv.apk")
    assert admin.patch(ADMIN + "/releases/" + old["id"], json={"published": False}).status_code == 200
    assert {r["id"] for r in admin.get(PUBLIC + "/software/test-player").json()["releases"]} == {new["id"], tv["id"]}
