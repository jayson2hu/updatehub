"""v4 station features: advice and stable versions, anonymous feedback, wishes,
favourites sync codes, aggregate statistics and the admin dashboard."""
from datetime import timedelta
import hashlib

import pytest
from sqlalchemy import select

from app.models.entities import utcnow
from app.models.station import StationFeedbackIssue, StationSoftware, StationStatsDaily, StationSyncCode
from app.seed_station import seed_station
from app.services.station_engagement import StatsService, redact, today
from tests.test_station import ADMIN, PUBLIC, release, software

SITE = "http://localhost:3000"


def published(admin, app, version, **overrides):
    return release(admin, app, version=version, published=True, **overrides)


def test_v4_fields_round_trip_and_labels(admin):
    app = software(admin, category="video", developer="示例工作室", website_url="https://example.com", tags=["影视", "影视", "多端"], description="详细介绍",
                   install_guides={"android": ["第一步", "第二步"], "tv": []}, faqs=[{"question": "电视怎么装？", "answer": "用 U 盘", "platforms": ["tv"]}])
    assert app["category"] == "video" and app["tags"] == ["影视", "多端"]
    assert app["install_guides"] == {"android": ["第一步", "第二步"]}
    assert app["faqs"][0]["platforms"] == ["tv"] and app["favorite_count"] == 0
    item = published(admin, app, "1.0", advice="recommended", advice_note="可以更新", changes=[{"kind": "added", "text": "新增片单"}, {"kind": "known_issue", "text": "个别机型发热"}], package_size="30 MB", requirements="Android 8+", release_date="2026-10-01")
    assert item["advice"] == "recommended" and item["changes"][1]["kind"] == "known_issue" and item["release_date"] == "2026-10-01"
    bad = admin.post(ADMIN + "/software", json={"slug": "bad", "name": "坏", "category": "game", "website_url": "javascript:alert(1)"})
    assert bad.status_code == 422 and "软件分类" in bad.json()["detail"] and "官网" in bad.json()["detail"]
    bad = admin.post(ADMIN + "/releases", json={"software_id": app["id"], "platform": "android", "version": "2", "changes": [{"kind": "added", "text": ""}]})
    assert bad.status_code == 422 and "更新内容" in bad.json()["detail"]


def test_hold_requires_published_stable_release_of_same_device(admin, client):
    app = software(admin)
    stable = published(admin, app, "1.0")
    tv = published(admin, app, "1.0", platform="tv")
    draft = release(admin, app, version="1.1")
    missing = admin.post(ADMIN + "/releases", json={"software_id": app["id"], "platform": "android", "version": "2.0", "advice": "hold"})
    assert missing.status_code == 422 and "稳定版本" in missing.json()["detail"]
    for wrong in (tv["id"], draft["id"], "missing"):
        response = admin.post(ADMIN + "/releases", json={"software_id": app["id"], "platform": "android", "version": "2.0", "advice": "hold", "stable_release_id": wrong})
        assert response.status_code == 422 and "推荐稳定版" in response.json()["detail"]
    held = published(admin, app, "2.0", advice="hold", stable_release_id=stable["id"])
    assert held["stable_release_id"] == stable["id"] and held["previous_version"] == "1.0"
    # Changing the advice away from "hold" clears the pointer.
    changed = admin.patch(ADMIN + "/releases/" + held["id"], json={"advice": "recommended"}).json()
    assert changed["stable_release_id"] is None
    data = client.get(PUBLIC + "/data").json()
    previous = {item["version"] + item["platform"]: item["previous_version"] for item in data["releases"]}
    assert previous == {"1.0android": "", "1.0tv": "", "2.0android": "1.0"}


def test_seed_contains_hold_example_and_v4_profile(client, database):
    with database() as db:
        seed_station(db)
    data = client.get(PUBLIC + "/data").json()
    held = [item for item in data["releases"] if item["advice"] == "hold"]
    assert len(held) == 1
    stable = next(item for item in data["releases"] if item["id"] == held[0]["stable_release_id"])
    assert (stable["software_id"], stable["platform"], stable["version"]) == (held[0]["software_id"], "desktop", "4.0.6")
    assert {item["category"] for item in data["software"]} >= {"video", "netdisk", "note", "tool"}
    assert data["settings"]["site_name"] == "版本喵"
    assert all(item["install_guides"] for item in data["software"])


def test_anonymous_feedback_counts_details_and_privacy(client, admin):
    app = software(admin)
    item = published(admin, app, "1.0")
    link_id = item["links"][0]["id"]
    assert client.post(PUBLIC + "/feedback", json={"release_id": item["id"], "verdict": "ok"}).status_code == 204
    assert client.post(PUBLIC + "/feedback", json={"release_id": item["id"], "verdict": "issue"}).status_code == 422
    note = "打不开，加我微信 abc12345 或打 138 0013 8000，邮箱 a@b.com"
    assert client.post(PUBLIC + "/feedback", json={"release_id": item["id"], "verdict": "issue", "kind": "link", "link_id": link_id, "note": note}).status_code == 204
    assert client.post(PUBLIC + "/feedback", json={"release_id": item["id"], "verdict": "issue", "kind": "link", "link_id": "other"}).status_code == 422
    assert client.post(PUBLIC + "/feedback", json={"release_id": item["id"], "verdict": "ok"}, headers={"Origin": "https://attacker.example"}).status_code == 403
    draft = release(admin, app, version="2.0")
    assert client.post(PUBLIC + "/feedback", json={"release_id": draft["id"], "verdict": "ok"}).status_code == 404
    public = next(row for row in client.get(PUBLIC + "/data").json()["releases"] if row["id"] == item["id"])
    assert (public["feedback_ok"], public["feedback_issue"]) == (1, 1)
    listing = admin.get(ADMIN + "/feedback").json()
    stored = listing["items"][0]
    assert stored["kind"] == "link" and stored["link_label"] == "示例来源" and stored["status"] == "new"
    for secret in ("abc12345", "138", "a@b.com"):
        assert secret not in stored["note"]
    assert set(stored) >= {"software_name", "version", "platform"} and "ip" not in str(stored).lower()
    assert listing["releases"][0]["issues"] == 1 and listing["releases"][0]["kinds"] == {"link": 1}
    dashboard = admin.get(ADMIN + "/dashboard").json()
    assert dashboard["broken_links"][0]["label"] == "示例来源" and dashboard["counts"]["new_issues"] == 1
    assert admin.patch(ADMIN + "/feedback", json={"ids": [stored["id"]], "status": "handled"}).status_code == 204
    assert admin.get(ADMIN + "/feedback?status=new").json()["items"] == []
    assert admin.patch(ADMIN + "/feedback", json={"ids": ["missing"], "status": "handled"}).status_code == 404


def test_feedback_is_rate_limited(client, admin):
    item = published(admin, software(admin), "1.0")
    codes = [client.post(PUBLIC + "/feedback", json={"release_id": item["id"], "verdict": "ok"}).status_code for _ in range(21)]
    assert codes[:20] == [204] * 20 and codes[20] == 429


def test_wishes_merge_by_normalised_name_and_admin_workflow(client, admin):
    first = client.post(PUBLIC + "/wishes", json={"name": "XX 剪辑", "platforms": ["android"]})
    assert first.status_code == 201 and first.json()["votes"] == 1 and first.json()["status"] == "new" and first.json()["id"]
    second = client.post(PUBLIC + "/wishes", json={"name": "ｘｘ剪辑", "platforms": ["desktop"], "note": "电脑也要"})
    assert second.json()["votes"] == 2
    assert client.post(PUBLIC + "/wishes", json={"name": "!!!"}).status_code == 422
    wishes = admin.get(ADMIN + "/wishes").json()
    assert len(wishes) == 1 and wishes[0]["platforms"] == ["android", "desktop"] and wishes[0]["note"] == "电脑也要"
    wish_id = wishes[0]["id"]
    assert admin.patch(ADMIN + "/wishes/" + wish_id, json={"status": "added"}).status_code == 422
    app = software(admin)
    done = admin.patch(ADMIN + "/wishes/" + wish_id, json={"status": "added", "software_id": app["id"]}).json()
    assert done["status"] == "added" and done["software_id"] == app["id"] and done["handled_at"]
    assert admin.get(ADMIN + "/wishes?status=new").json() == []
    assert client.patch(ADMIN + "/wishes/" + wish_id, json={"status": "new"}, headers={"X-CSRF-Token": "wrong"}).status_code == 403


def test_sync_code_create_restore_expiry_and_unpublished_filter(client, admin, database):
    shown = software(admin)
    hidden = software(admin, slug="hidden-app", name="草稿软件", published=False)
    created = client.post(PUBLIC + "/sync-codes", json={"software_ids": [shown["id"], hidden["id"], "missing"], "device": "android"})
    assert created.status_code == 201
    code = created.json()["code"]
    assert len(code) == 10 and not set(code) & set("01ILO")
    restored = client.get(PUBLIC + "/sync-codes/" + code[:5].lower() + "-" + code[5:]).json()
    assert restored["software_ids"] == [shown["id"]] and restored["device"] == "android"
    admin.patch(ADMIN + "/software/" + shown["id"], json={"published": False})
    assert client.get(PUBLIC + "/sync-codes/" + code).json()["software_ids"] == []
    with database() as db:
        db.get(StationSyncCode, hashlib.sha256(code.encode()).hexdigest()).expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    assert client.get(PUBLIC + "/sync-codes/" + code).status_code == 404
    with database() as db:
        StatsService(db).purge()
        assert db.get(StationSyncCode, hashlib.sha256(code.encode()).hexdigest()) is None


def test_sync_restore_is_throttled_against_guessing(client):
    codes = [client.get(PUBLIC + "/sync-codes/AAAAAAAAAA").status_code for _ in range(6)]
    assert codes[:5] == [404] * 5 and codes[5] == 429


def test_sync_regeneration_invalidates_old_code_and_stores_only_hash(client, admin, database):
    app = software(admin)
    first = client.post(PUBLIC + "/sync-codes", json={"software_ids": [app["id"]]}).json()
    second = client.post(PUBLIC + "/sync-codes", json={"software_ids": [app["id"]], "previous_code": first["code"]}).json()
    assert client.get(PUBLIC + "/sync-codes/" + first["code"]).status_code == 404
    assert client.get(PUBLIC + "/sync-codes/" + second["code"]).json()["software_ids"] == [app["id"]]
    assert client.get(PUBLIC + "/sync-codes/" + second["code"] + "ZZ").status_code == 404
    with database() as db:
        rows = list(db.scalars(select(StationSyncCode)))
        assert len(rows) == 1 and len(rows[0].code) == 64 and rows[0].code != second["code"]
        assert rows[0].software_ids == [app["slug"]]


def test_vote_change_cancel_receipt_replay_and_channel(client, admin):
    item = published(admin, software(admin), "1.0")
    endpoint = PUBLIC + "/feedback/vote"
    first = client.post(endpoint, json={"release_id": item["id"], "verdict": "ok"}).json()
    assert (first["oks"], first["issues"]) == (1, 0)
    changed = client.post(endpoint, json={"release_id": item["id"], "verdict": "issue", "receipt": first["receipt"], "channel": "wechat"}).json()
    assert (changed["oks"], changed["issues"]) == (0, 1)
    assert client.post(endpoint, json={"release_id": item["id"], "verdict": "issue", "receipt": first["receipt"]}).status_code == 409
    detail = client.post(endpoint, json={"release_id": item["id"], "verdict": "issue", "receipt": changed["receipt"], "action": "details", "kind": "crash", "note": "<b>闪退</b>"}).json()
    assert detail["issues"] == 1
    stored = admin.get(ADMIN + "/feedback").json()["items"][0]
    assert stored["channel"] == "wechat" and stored["note"] == "<b>闪退</b>"
    cancelled = client.post(endpoint, json={"release_id": item["id"], "verdict": "none", "receipt": detail["receipt"]}).json()
    assert (cancelled["oks"], cancelled["issues"], cancelled["receipt"]) == (0, 0, "")
    assert admin.get(ADMIN + "/feedback").json()["items"] == []


def test_wish_public_status_follows_merge_and_intake(client, admin):
    first = client.post(PUBLIC + "/wishes", json={"name": "xx输入法app", "platforms": ["android"]}).json()
    same = client.post(PUBLIC + "/wishes", json={"name": "ＸＸ 输入法", "platforms": ["tv"]}).json()
    assert same["id"] == first["id"] and same["votes"] == 2
    second = client.post(PUBLIC + "/wishes", json={"name": "另一款输入法"}).json()
    assert admin.patch(ADMIN + "/wishes/" + first["id"], json={"merge_into_id": second["id"]}).status_code == 200
    app = software(admin)
    assert admin.patch(ADMIN + "/wishes/" + second["id"], json={"status": "added", "software_id": app["id"]}).status_code == 200
    result = client.get(PUBLIC + "/wishes/" + first["id"]).json()
    assert result["status"] == "added" and result["software_slug"] == app["slug"] and result["votes"] == 3


def test_events_only_count_known_content_and_update_estimates(client, admin, database):
    app = software(admin)
    item = published(admin, app, "1.0")
    events = [
        {"event": "page_view", "key": "home"}, {"event": "page_view", "key": "hacker"},
        {"event": "sw_view", "key": app["id"]}, {"event": "sw_view", "key": "missing"},
        {"event": "dl_copy", "key": item["id"]}, {"event": "fav_add", "key": app["id"]}, {"event": "fav_add", "key": app["id"]},
        {"event": "fav_remove", "key": app["id"]}, {"event": "search", "key": "播放器"}, {"event": "search", "key": "13800138000"},
    ]
    assert client.post(PUBLIC + "/events", json={"events": events}).status_code == 204
    assert client.post(PUBLIC + "/events", json={"events": [{"event": "fav_remove", "key": app["id"]}] * 5}).status_code == 204
    assert client.post(PUBLIC + "/events", json={"events": [{"event": "unknown", "key": "x"}]}).status_code == 422
    with database() as db:
        rows = {(row.event, row.key): row.count for row in db.scalars(select(StationStatsDaily))}
        assert rows == {("page_view", "home"): 1, ("sw_view", app["id"]): 1, ("dl_copy", item["id"]): 1, ("fav_add", app["id"]): 2, ("fav_remove", app["id"]): 6, ("search", "播放器"): 1}
        assert db.get(StationSoftware, app["id"]).favorite_count == 0  # Never negative.
        assert db.get(StationSoftware, app["id"]).view_count == 1
    data = client.get(PUBLIC + "/data").json()
    assert data["stats"]["software"][app["id"]]["views_7d"] == 1 and data["stats"]["hot_software"] == [app["id"]] and data["stats"]["hot_searches"] == ["播放器"]


def test_stats_retention_purges_old_rows(client, database):
    with database() as db:
        db.add(StationStatsDaily(day=today() - timedelta(days=90), event="page_view", key="home", count=3))
        db.add(StationStatsDaily(day=today() - timedelta(days=89), event="page_view", key="home", count=4))
        db.commit()
        StatsService(db).purge()
        assert [row.count for row in db.scalars(select(StationStatsDaily))] == [4]


def test_ad_placement_switches_filter_public_promotions_and_dashboard(client, admin):
    payload = {"slug": "promo", "title": "活动", "target_url": "https://example.com", "published": True, "placements": ["home_feed", "detail_body"]}
    promotion = admin.post(ADMIN + "/promotions", json=payload).json()
    admin.patch(ADMIN + "/settings", json={"ads_enabled": True, "ad_placements": {"home_feed": False}})
    promotions = client.get(PUBLIC + "/data").json()["promotions"]
    assert promotions[0]["placements"] == ["detail_body"]
    admin.patch(ADMIN + "/settings", json={"ad_placements": {"home_feed": False, "detail_body": False}})
    assert client.get(PUBLIC + "/data").json()["promotions"] == []
    client.post(PUBLIC + "/events", json={"events": [{"event": "ad_imp", "key": "detail_body:" + promotion["id"]}, {"event": "ad_click", "key": "detail_body:" + promotion["id"]}, {"event": "ad_imp", "key": "nowhere:" + promotion["id"]}]})
    dashboard = admin.get(ADMIN + "/dashboard").json()
    by_slot = {row["placement"]: row for row in dashboard["ads"]}
    assert by_slot["detail_body"] == {"placement": "detail_body", "enabled": False, "impressions": 1, "clicks": 1}
    assert by_slot["home_feed"]["enabled"] is False and by_slot["desktop_sidebar"]["enabled"] is True
    assert dashboard["promotions"][0]["impressions"] == 1


def test_reserved_ad_slots_accept_promotions_and_report_separately(client, admin):
    slots = ["home_feed", "home_banner", "library_bottom", "detail_body", "announcement_bottom", "desktop_sidebar"]
    payload = {"slug": "all-slots", "title": "全部位置", "target_url": "https://example.com", "published": True, "placements": slots}
    promotion = admin.post(ADMIN + "/promotions", json=payload)
    assert promotion.status_code == 201 and promotion.json()["placements"] == slots
    assert admin.post(ADMIN + "/promotions", json={**payload, "slug": "bad-slot", "placements": ["top_banner"]}).status_code == 422
    admin.patch(ADMIN + "/settings", json={"ads_enabled": True, "ad_placements": {"home_banner": False}})
    public = client.get(PUBLIC + "/data").json()["promotions"]
    assert public[0]["placements"] == [slot for slot in slots if slot != "home_banner"]
    client.post(PUBLIC + "/events", json={"events": [{"event": "ad_imp", "key": "announcement_bottom:" + promotion.json()["id"]}]})
    by_slot = {row["placement"]: row for row in admin.get(ADMIN + "/dashboard").json()["ads"]}
    assert list(by_slot) == slots
    assert by_slot["announcement_bottom"]["impressions"] == 1 and by_slot["home_banner"]["enabled"] is False


def test_dashboard_series_and_permissions(client, admin):
    app = software(admin)
    published(admin, app, "1.0")
    client.post(PUBLIC + "/events", json={"events": [{"event": "page_view", "key": "home"}] * 3 + [{"event": "fav_add", "key": app["id"]}]})
    dashboard = admin.get(ADMIN + "/dashboard?days=7").json()
    assert len(dashboard["series"]) == 7 and dashboard["series"][-1]["visits"] == 3
    assert dashboard["totals"]["visits"] == 3 and dashboard["totals"]["favorites"] == 1
    assert dashboard["recent_releases"][0]["software_name"] == app["name"]
    assert admin.get(ADMIN + "/dashboard?days=91").status_code == 422
    client.cookies.clear()
    for path in ("/dashboard", "/feedback", "/wishes"):
        assert client.get(ADMIN + path).status_code == 401


@pytest.mark.parametrize("text, hidden", [("微信 abcdef1", "abcdef1"), ("https://x.cn/a", "x.cn"), ("电话：021-12345678", "12345678")])
def test_redact_contact_details(text, hidden):
    assert hidden not in redact(text)
