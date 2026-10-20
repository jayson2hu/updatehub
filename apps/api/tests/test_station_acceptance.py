"""Operational acceptance regressions; every test uses a temporary database."""
import io
from datetime import timedelta

from PIL import Image

from app.core.config import get_settings
from app.core.database import build_engine
from app.models.entities import utcnow
from app.models.station import StationFeedbackDaily, StationFeedbackIssue, StationSettings, StationSoftware
from app.services.station_engagement import today
from tests.test_station import ADMIN, PUBLIC, notice, release, software


def test_browser_hints_are_independent_persisted_settings_and_brand_is_validated(admin, client, database):
    defaults = client.get(PUBLIC + "/data").json()["settings"]
    assert defaults["inapp_hint"] is True and defaults["wechat_inapp_hint"] is False
    response = admin.patch(ADMIN + "/settings", json={"wechat_inapp_hint": True})
    assert response.status_code == 200 and response.json()["wechat_inapp_hint"] is True
    assert response.json()["inapp_hint"] is True
    response = admin.patch(ADMIN + "/settings", json={"inapp_hint": False})
    assert response.status_code == 200 and response.json()["wechat_inapp_hint"] is True
    with database() as db:
        settings = db.get(StationSettings, "site")
        assert settings.wechat_inapp_hint is True and settings.inapp_hint is False
    for name in ("喵", "中文站名不能超过八个字", "x" * 17):
        invalid = admin.patch(ADMIN + "/settings", json={"site_name": name})
        assert invalid.status_code == 422 and "站名" in invalid.json()["detail"]
    response = admin.patch(ADMIN + "/settings", json={"site_name": "x" * 16, "wechat_inapp_hint": False})
    assert response.status_code == 200
    settings = client.get(PUBLIC + "/data").json()["settings"]
    assert settings["site_name"] == "x" * 16 and settings["wechat_inapp_hint"] is False
    assert settings["inapp_hint"] is False
    # A name accepted by the previous version must not take the public site
    # down after upgrading, or prevent changing an unrelated browser switch.
    with database() as db:
        db.get(StationSettings, "site").site_name = "喵"
        db.commit()
    legacy = client.get(PUBLIC + "/data")
    assert legacy.status_code == 200 and legacy.json()["settings"]["site_name"] == "喵"
    assert admin.patch(ADMIN + "/settings", json={"wechat_inapp_hint": True}).status_code == 200
    assert admin.patch(ADMIN + "/settings", json={"site_name": "喵"}).status_code == 422


def test_batch_requires_auth_and_legacy_is_disabled_by_default(client, monkeypatch):
    assert client.post(ADMIN + "/releases/batch", json={}).status_code == 401
    monkeypatch.setenv("LEGACY_ENABLED", "false")
    get_settings.cache_clear()
    assert client.get("/api/v1/software").status_code == 410
    assert client.get(PUBLIC + "/data").status_code == 200
    assert client.get("/api/v1/health").status_code == 200


def test_batch_is_atomic_and_each_platform_keeps_its_link(admin, client):
    app = software(admin)
    common = {"software_id": app["id"], "version": "2.0", "published": True, "summary": "修复启动黑屏"}
    failed = admin.post(ADMIN + "/releases/batch", json={"releases": [{**common, "platform": "android"}, {**common, "platform": "desktop"}]})
    assert failed.status_code == 422
    assert client.get(PUBLIC + "/software/" + app["slug"]).json()["releases"] == []
    payload = [{**common, "platform": p, "links": [{"label": "官方来源", "url": f"https://downloads.example.test/{p}/2.0", "is_primary": True}]} for p in ("android", "tv")]
    saved = admin.post(ADMIN + "/releases/batch", json={"releases": payload})
    assert saved.status_code == 201, saved.text
    releases = client.get(PUBLIC + "/software/" + app["slug"]).json()["releases"]
    assert {r["platform"]: r["links"][0]["url"] for r in releases} == {p: f"https://downloads.example.test/{p}/2.0" for p in ("android", "tv")}
    legacy = release(admin, app, version="1.0", published=True, links=[{"label": "旧版", "url": "https://downloads.example.test/android/1.0"}])
    assert any(r["id"] == legacy["id"] for r in client.get(PUBLIC + "/software/" + app["slug"]).json()["releases"])


def test_referenced_stable_release_cannot_be_withdrawn_or_disabled(admin):
    app = software(admin)
    stable = release(admin, app, published=True)
    newest = release(admin, app, version="2.0", published=True, advice="hold", stable_release_id=stable["id"])
    for patch in ({"published": False}, {"status": "unavailable"}, {"advice": "hold", "stable_release_id": newest["id"]}):
        result = admin.patch(ADMIN + "/releases/" + stable["id"], json=patch)
        assert result.status_code == 422 and "稳定版" in result.json()["detail"]
    assert admin.patch(ADMIN + "/releases/" + newest["id"], json={"published": False}).status_code == 200
    assert admin.patch(ADMIN + "/releases/" + stable["id"], json={"published": False}).status_code == 200


def test_handled_feedback_and_merged_wishes_leave_workbench(admin, client, database):
    app = software(admin)
    version = release(admin, app, published=True)
    with database() as db:
        db.add(StationFeedbackDaily(release_id=version["id"], day=today(), ok_count=0, issue_count=47))
        db.add_all(StationFeedbackIssue(release_id=version["id"], kind="crash", note="黑屏", status="new") for _ in range(47))
        db.commit()
    dashboard = admin.get(ADMIN + "/dashboard").json()
    assert dashboard["hot_releases"][0]["pending_issues"] == 47
    assert dashboard["hot_releases"][0]["pending_kinds"] == {"crash": 47}
    ids = [i["id"] for i in admin.get(ADMIN + "/feedback").json()["items"]]
    assert admin.patch(ADMIN + "/feedback", json={"ids": ids, "status": "handled"}).status_code == 204
    assert admin.get(ADMIN + "/dashboard").json()["hot_releases"] == []
    first = client.post(PUBLIC + "/wishes", json={"name": "测试记事本"}).json()
    second = client.post(PUBLIC + "/wishes", json={"name": "测试备忘录"}).json()
    assert admin.patch(ADMIN + "/wishes/" + first["id"], json={"merge_into_id": second["id"]}).status_code == 200
    dashboard = admin.get(ADMIN + "/dashboard").json()
    assert dashboard["counts"]["new_wishes"] == 1
    assert len(dashboard["wishes"]) == 1 and dashboard["wishes"][0]["votes"] == 2


def test_added_wish_requires_a_visible_software_entry(admin, client):
    app = software(admin, published=False)
    wish = client.post(PUBLIC + "/wishes", json={"name": "等待上架的软件"}).json()
    payload = {"status": "added", "software_id": app["id"]}
    rejected = admin.patch(ADMIN + "/wishes/" + wish["id"], json=payload)
    assert rejected.status_code == 422 and "先上架" in rejected.json()["detail"]
    assert client.get(PUBLIC + "/wishes/" + wish["id"]).json()["status"] == "new"
    admin.patch(ADMIN + "/software/" + app["id"], json={"published": True})
    assert admin.patch(ADMIN + "/wishes/" + wish["id"], json=payload).status_code == 200
    assert client.get(PUBLIC + "/wishes/" + wish["id"]).json()["software_slug"] == app["slug"]


def test_replacing_broken_link_handles_only_its_link_reports(admin, database):
    app = software(admin)
    version = release(admin, app, published=True)
    link = version["links"][0]
    with database() as db:
        db.add_all([StationFeedbackIssue(release_id=version["id"], link_id=link["id"], kind="link", note="失效"), StationFeedbackIssue(release_id=version["id"], kind="crash", note="闪退")])
        db.commit()
    assert admin.patch(ADMIN + "/releases/" + version["id"], json={"links": [{**link, "url": "https://downloads.example.test/new"}]}).status_code == 200
    issues = admin.get(ADMIN + "/feedback").json()["items"]
    assert {i["kind"]: i["status"] for i in issues} == {"link": "handled", "crash": "new"}


def test_illustrated_guides_and_images_survive_new_engine(admin, client):
    image = io.BytesIO()
    Image.new("RGB", (64, 64), "#245bdd").save(image, "PNG")
    result = admin.post(ADMIN + "/uploads", files={"file": ("step.png", image.getvalue(), "image/png")})
    assert result.status_code == 201
    url = result.json()["url"]
    app = software(admin, pricing="免费，部分功能需付费", listed_at="2026-10-01", install_guides={"tv": ["复制安装包到 U 盘", "在电视文件管理中安装"]}, install_illustrations={"tv": {"1": url}}, install_tips={"tv": "先备份配置"})
    engine = build_engine(get_settings().database_url)
    from sqlalchemy.orm import Session
    with Session(engine) as db:
        stored = db.get(StationSoftware, app["id"])
        assert stored.pricing == "免费，部分功能需付费" and stored.install_illustrations == {"tv": {"1": url}}
    engine.dispose()
    path = get_settings().upload_dir / url.rsplit("/", 1)[1]
    with Image.open(path) as saved:
        assert saved.size == (64, 64)
    shown = client.get(PUBLIC + "/software/" + app["slug"]).json()["software"]
    assert shown["install_tips"] == {"tv": "先备份配置"} and shown["listed_at"] == "2026-10-01"
    assert admin.patch(ADMIN + "/software/" + app["id"], json={"install_illustrations": {"tv": {"0": "https://unsafe.example.test/image.png"}}}).status_code == 422


def test_announcement_expiry_association_withdrawal_and_counts(admin, client):
    app = software(admin)
    item = notice(admin, software_ids=[app["id"]], expires_at=(utcnow() + timedelta(hours=1)).isoformat())
    assert client.get(PUBLIC + "/software/" + app["slug"]).json()["announcements"][0]["effective_pinned"]
    assert client.post(PUBLIC + "/events", json={"events": [{"event": "ann_view", "key": item["id"]}]}).status_code == 204
    assert client.get(PUBLIC + "/announcements/" + item["slug"]).json()["view_count"] == 1
    admin.patch(ADMIN + "/announcements/" + item["id"], json={"expires_at": (utcnow() - timedelta(seconds=1)).isoformat()})
    ended = client.get(PUBLIC + "/announcements/" + item["slug"]).json()
    assert ended["expired"] and not ended["effective_pinned"]
    admin.patch(ADMIN + "/announcements/" + item["id"], json={"published": False})
    assert client.get(PUBLIC + "/announcements/" + item["slug"]).status_code == 404


def test_receipt_tampering_cross_version_and_release_view_counts(admin, client):
    app = software(admin)
    first = release(admin, app, published=True)
    second = release(admin, app, version="2.0", published=True)
    vote = client.post(PUBLIC + "/feedback/vote", json={"release_id": first["id"], "verdict": "ok"}).json()
    assert client.post(PUBLIC + "/feedback/vote", json={"release_id": second["id"], "verdict": "none", "receipt": vote["receipt"]}).status_code == 422
    assert client.post(PUBLIC + "/feedback/vote", json={"release_id": first["id"], "verdict": "none", "receipt": vote["receipt"] + "x"}).status_code == 422
    client.post(PUBLIC + "/events", json={"events": [{"event": "release_view", "key": first["id"]}, {"event": "release_view", "key": "missing"}]})
    shown = client.get(PUBLIC + "/software/" + app["slug"]).json()["releases"]
    assert {r["id"]: r["view_count"] for r in shown} == {first["id"]: 1, second["id"]: 0}
