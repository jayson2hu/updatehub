from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models import AuditLog, OfficialLink, ReleaseUpdate, Software
from app.seed import seed
from app.seed_updates import EXAMPLES, seed_updates
from app.services.catalog import CatalogService


def software(admin, **overrides):
    response = admin.post("/api/v1/admin/software", json={"name": "Visual Studio Code", "slug": "vscode", "aliases": ["蓝色编辑器", "VS Code"], "short_name": "VS Code", "published": True, "latest_version": "baseline", "official_links": [{"label": "官网", "url": "https://code.visualstudio.com/", "is_primary": True}], **overrides})
    assert response.status_code == 201, response.text
    return response.json()


def draft(admin, **overrides):
    response = admin.post("/api/v1/admin/updates", json={"slug": "example-notice", "title": "演示公告", "kind": "notice", "summary": "概要说明", "content": "正文说明与具体变化", "reason_to_update": "请核对项目要求，再决定下一步。", "who_should_update": "需要使用相关功能的成员", **overrides})
    assert response.status_code == 201, response.text
    return response.json()


def publish(admin, item):
    response = admin.post(f"/api/v1/admin/updates/{item['id']}/publish", json={"confirmed": True})
    assert response.status_code == 200, response.text
    return response.json()


def test_announcement_auth_and_csrf(client):
    assert client.get("/api/v1/admin/updates").status_code == 401
    assert client.get("/api/v1/admin/software/unknown/history").status_code == 401
    assert client.post("/api/v1/admin/updates", json={"title": "Notice", "slug": "notice"}).status_code == 401


def test_release_manual_publish_synchronizes_version_and_audits(admin):
    app = software(admin)
    item = draft(admin, kind="release", software_id=app["id"], version="2.0", previous_version="1.0", update_level="recommended", official_release_date="2026-09-20", status="review")
    assert admin.get("/api/v1/updates").json()["total"] == 0
    assert admin.get(f"/api/v1/updates/{item['slug']}").status_code == 404
    path = f"/api/v1/admin/updates/{item['id']}"
    assert admin.post(path + "/publish", json={"confirmed": False}).status_code == 422
    assert admin.post(path + "/publish", json={}).status_code == 422
    assert admin.post(path + "/publish", json={"confirmed": True}, headers={"X-CSRF-Token": ""}).status_code == 403
    assert admin.patch(path, json={"status": "published"}).status_code == 409
    assert admin.patch(path, json={"published_at": "2000-01-01T00:00:00Z"}).status_code == 422
    published = publish(admin, item)
    assert published["published_at"].endswith("Z") and published["created_at"].endswith("Z")
    assert published["official_release_date"] == "2026-09-20"
    live = admin.get("/api/v1/software/vscode").json()
    assert (live["latest_version"], live["update_level"], live["update_reason"]) == ("2.0", "recommended", item["reason_to_update"])
    assert admin.get("/api/v1/software/vscode/updates").json()["items"][0]["id"] == item["id"]
    logs = admin.get("/api/v1/admin/audit?page_size=100").json()["items"]
    assert any(row["action"] == "publish" and row["resource_id"] == item["id"] and row["payload"]["after"]["status"] == "published" for row in logs)
    assert any(row["action"] == "sync_version" and row["payload"]["before"]["latest_version"] == "baseline" and row["payload"]["after"]["latest_version"] == "2.0" for row in logs)


def test_publication_validation_and_partial_patch_cannot_bypass(admin, database):
    item = draft(admin, content="", kind="release")
    path = f"/api/v1/admin/updates/{item['id']}"
    assert admin.post(path + "/publish", json={"confirmed": True}).status_code == 422
    app = software(admin)
    assert admin.patch(path, json={"software_id": app["id"], "version": "2.0", "content": "complete"}).status_code == 200
    with database() as db:
        db.get(OfficialLink, app["official_links"][0]["id"]).is_active = False
        db.commit()
    assert admin.post(path + "/publish", json={"confirmed": True}).status_code == 422
    assert admin.patch(path, json={"official_release_url": "https://localhost/release"}).status_code == 422
    assert admin.patch(path, json={"official_release_url": "https://code.visualstudio.com/updates"}).status_code == 200
    publish(admin, item)
    for field in ("version", "summary", "content", "reason_to_update", "who_should_update"):
        assert admin.patch(path, json={field: ""}).status_code == 422
    assert admin.patch(path, json={"status": "draft"}).status_code == 409
    assert admin.patch(path, json={"kind": "notice"}).status_code == 409
    assert admin.patch(path, json={"software_id": None}).status_code == 409
    assert admin.get(f"/api/v1/updates/{item['slug']}").json()["version"] == "2.0"


def test_sitewide_notice_visibility_archive_and_notifications(admin):
    item = draft(admin, is_demo=True, is_pinned=True, title="维护 *示例*", kind="maintenance", changes=["示例变更说明"])
    path = f"/api/v1/admin/updates/{item['id']}"
    assert admin.get(path + "/notification").status_code == 409
    published = publish(admin, item)
    assert published["software"] is None
    plain = admin.get(path + "/notification?format=plain").json()["text"]
    markdown = admin.get(path + "/notification?format=markdown").json()["text"]
    assert "演示公告，请勿作为真实通知转发" in plain
    assert "影响范围" in plain and "建议行动" in plain and "/update/example-notice" in plain
    assert "主要变化" in plain and "示例变更说明" in plain
    assert "**" in markdown and "[查看完整公告]" in markdown and r"\*示例\*" in markdown
    assert admin.get(path + "/notification?format=html").status_code == 422
    assert admin.post(path + "/archive", json={}).json()["status"] == "archived"
    assert admin.get("/api/v1/updates").json()["total"] == 0
    assert admin.get("/api/v1/updates/example-notice").status_code == 404
    assert admin.get(path + "/notification").status_code == 409
    assert admin.get("/api/v1/admin/updates?status=archived").json()["total"] == 1
    assert publish(admin, item)["published_at"] == published["published_at"]


def test_old_edits_backfills_and_republication_do_not_rollback_version(admin):
    app = software(admin)
    old = publish(admin, draft(admin, slug="old", kind="release", software_id=app["id"], version="1.0", official_release_date="2026-09-19"))
    current = publish(admin, draft(admin, slug="current", kind="release", software_id=app["id"], version="3.0", official_release_date="2026-09-21"))
    assert admin.patch(f"/api/v1/admin/updates/{old['id']}", json={"version": "1.1", "title": "Edited old"}).status_code == 200
    publish(admin, draft(admin, slug="backfill", kind="release", software_id=app["id"], version="2.0", official_release_date="2026-09-20"))
    assert admin.get("/api/v1/software/vscode").json()["latest_version"] == "3.0"
    assert admin.patch(f"/api/v1/admin/updates/{old['id']}", json={"official_release_date": "2026-09-22"}).status_code == 409
    assert admin.post(f"/api/v1/admin/updates/{current['id']}/archive").status_code == 200
    assert admin.get("/api/v1/software/vscode").json()["latest_version"] == "3.0"
    assert publish(admin, old)["published_at"] == old["published_at"]
    assert admin.get("/api/v1/software/vscode").json()["latest_version"] == "3.0"
    assert admin.patch(f"/api/v1/admin/updates/{current['id']}", json={"version": "3.1"}).status_code == 200
    assert admin.get("/api/v1/software/vscode").json()["latest_version"] == "3.0"
    publish(admin, current)
    assert admin.get("/api/v1/software/vscode").json()["latest_version"] == "3.1"


def test_linked_software_unpublish_hides_all_public_entrypoints(admin):
    app = software(admin)
    linked = publish(admin, draft(admin, software_id=app["id"], slug="linked"))
    publish(admin, draft(admin, slug="sitewide"))
    admin.delete(f"/api/v1/admin/software/{app['id']}")
    assert admin.get("/api/v1/updates").json()["total"] == 1
    assert admin.get("/api/v1/updates/linked").status_code == 404
    assert admin.get("/api/v1/software/vscode/updates").status_code == 404
    assert admin.get(f"/api/v1/admin/updates/{linked['id']}/notification").status_code == 409
    pending = draft(admin, software_id=app["id"], slug="unpublished-software")
    assert admin.post(f"/api/v1/admin/updates/{pending['id']}/publish", json={"confirmed": True}).status_code == 422


def test_filters_alias_search_followed_software_and_pinned_order(admin, database):
    app = software(admin)
    linked = publish(admin, draft(admin, slug="linked", software_id=app["id"], update_level="hold"))
    pinned = publish(admin, draft(admin, slug="pinned", is_pinned=True))
    publish(admin, draft(admin, slug="newer", content="special body word"))
    with database() as db:
        db.get(ReleaseUpdate, pinned["id"]).published_at = datetime(2020, 1, 1, tzinfo=timezone.utc)
        db.commit()
    assert admin.get("/api/v1/updates").json()["items"][0]["id"] == pinned["id"]
    for query in ("蓝色编辑器", "Visual Studio", "VS Code"):
        assert admin.get("/api/v1/updates", params={"q": query}).json()["items"][0]["id"] == linked["id"]
    assert admin.get("/api/v1/updates?q=special").json()["total"] == 1
    assert admin.get("/api/v1/updates?update_level=hold").json()["total"] == 1
    assert admin.get("/api/v1/updates?kind=release").json()["total"] == 0
    assert admin.get("/api/v1/updates", params={"software_ids": app["id"] + ",missing"}).json()["total"] == 1
    assert admin.get("/api/v1/updates?software_ids=").json()["total"] == 0
    assert admin.get("/api/v1/updates", params={"software_ids": ",".join(str(i) for i in range(501))}).status_code == 422
    assert admin.get("/api/v1/updates?page_size=1&page=2").json()["total"] == 3


def test_publish_transaction_rolls_back_on_audit_failure(admin, database, monkeypatch):
    app = software(admin)
    item = draft(admin, kind="release", software_id=app["id"], version="2.0")
    original = CatalogService.audit

    def fail_publish_audit(self, admin_id, action, kind, resource_id, before=None, after=None):
        if action == "publish":
            raise RuntimeError("simulated audit storage failure")
        return original(self, admin_id, action, kind, resource_id, before, after)

    monkeypatch.setattr(CatalogService, "audit", fail_publish_audit)
    with pytest.raises(RuntimeError, match="simulated audit storage failure"):
        admin.post(f"/api/v1/admin/updates/{item['id']}/publish", json={"confirmed": True})
    with database() as db:
        assert db.get(ReleaseUpdate, item["id"]).status == "draft"
        assert db.get(ReleaseUpdate, item["id"]).published_at is None
        assert db.get(Software, app["id"]).latest_version == "baseline"
        assert db.get(Software, app["id"]).current_release_id is None
        assert not db.scalar(select(AuditLog).where(AuditLog.action == "sync_version"))


def test_demo_release_cannot_replace_real_software_facts(admin):
    app = software(admin, latest_version="9.0", is_demo=False)
    publish(admin, draft(admin, software_id=app["id"], kind="release", is_demo=True, version="DEMO 99"))
    current = admin.get("/api/v1/software/vscode").json()
    assert current["latest_version"] == "9.0" and current["is_demo"] is False
    publish(admin, draft(admin, slug="real-release", software_id=app["id"], kind="release", version="9.1", official_release_date="2026-01-01"))
    assert admin.get("/api/v1/software/vscode").json()["latest_version"] == "9.1"


@pytest.mark.parametrize("archived", [False, True])
def test_published_demo_classification_is_immutable_and_cannot_downgrade_authority(admin, archived):
    app = software(admin)
    old = publish(admin, draft(admin, slug="old-real", kind="release", software_id=app["id"], version="2.0", official_release_date="2026-09-20"))
    current = publish(admin, draft(admin, slug="current-real", kind="release", software_id=app["id"], version="3.0", official_release_date="2026-09-21"))
    demo = publish(admin, draft(admin, slug="newer-demo", kind="release", software_id=app["id"], version="DEMO 99", is_demo=True, official_release_date="2026-09-22"))
    if archived:
        for item in (current, demo):
            assert admin.post(f"/api/v1/admin/updates/{item['id']}/archive").status_code == 200
    audit_before = admin.get("/api/v1/admin/audit?page_size=100").json()
    for item, attempted_demo in ((current, True), (demo, False)):
        response = admin.patch(f"/api/v1/admin/updates/{item['id']}", json={"is_demo": attempted_demo, "title": "Should never persist"})
        assert response.status_code == 409
        unchanged = admin.get(f"/api/v1/admin/updates/{item['id']}").json()
        assert unchanged["is_demo"] is item["is_demo"]
        assert unchanged["title"] == item["title"]
    assert admin.get("/api/v1/admin/audit?page_size=100").json() == audit_before
    assert admin.get("/api/v1/software/vscode").json()["latest_version"] == "3.0"
    assert admin.patch(f"/api/v1/admin/updates/{old['id']}", json={"title": "Historical wording correction", "is_demo": False}).status_code == 200
    current_software = admin.get("/api/v1/software/vscode").json()
    assert current_software["latest_version"] == "3.0" and current_software["is_demo"] is False


def test_announcement_seed_is_demo_idempotent_and_safe(client, database):
    with database() as db:
        seed(db)
        assert seed_updates(db) == 0
    page = client.get("/api/v1/updates?page_size=100").json()
    assert page["total"] == 8
    assert client.get("/api/v1/updates?include_historical=true&page_size=100").json()["total"] == 11
    assert all(item["is_demo"] and item["status"] == "published" for item in page["items"])
    assert {item["kind"] for item in page["items"]} == {"notice", "release", "maintenance"}
    assert sum(item["is_pinned"] for item in page["items"]) == 2


def test_release_history_orders_dates_ignores_pins_and_filters_private_content(admin, database):
    app = software(admin)
    current = publish(admin, draft(admin, slug="history-current", kind="release", software_id=app["id"], version="3.0", official_release_date="2026-09-21"))
    # An older release is backfilled later and pinned; neither changes its position.
    old = publish(admin, draft(admin, slug="history-old", kind="release", software_id=app["id"], version="2.0", official_release_date="2026-09-19", is_pinned=True))
    undated = publish(admin, draft(admin, slug="history-undated", kind="release", software_id=app["id"], version="2.5"))
    with database() as db:
        db.get(ReleaseUpdate, undated["id"]).published_at = datetime(2026, 9, 20, 23, 30, tzinfo=timezone.utc)
        db.commit()
    for status in ("draft", "review"):
        draft(admin, slug=f"history-{status}", kind="release", software_id=app["id"], version="private", status=status)
    archived = publish(admin, draft(admin, slug="history-archived", kind="release", software_id=app["id"], version="archived", official_release_date="2026-09-18"))
    assert admin.post(f"/api/v1/admin/updates/{archived['id']}/archive").status_code == 200
    for kind in ("notice", "maintenance"):
        publish(admin, draft(admin, slug=f"history-{kind}", kind=kind, software_id=app["id"]))
    another = software(admin, slug="another-software")
    publish(admin, draft(admin, slug="history-other-software", kind="release", software_id=another["id"], version="1.0"))
    page = admin.get("/api/v1/software/vscode/history").json()
    assert page["total"] == 3
    assert [row["id"] for row in page["items"]] == [current["id"], undated["id"], old["id"]]
    assert all(row["kind"] == "release" and row["status"] == "published" for row in page["items"])
    assert page["items"][1]["published_at"] == "2026-09-20T23:30:00Z"
    assert admin.get("/api/v1/software/vscode/updates").json()["items"][0]["id"] == old["id"]
    first = admin.get("/api/v1/software/vscode/history?page=1&page_size=2").json()
    second = admin.get("/api/v1/software/vscode/history?page=2&page_size=2").json()
    assert first["total"] == second["total"] == 3
    assert first["page"] == 1 and second["page"] == 2 and second["page_size"] == 2
    assert [row["version"] for row in first["items"]] == ["3.0", "2.5"]
    assert [row["version"] for row in second["items"]] == ["2.0"]
    assert admin.get("/api/v1/software/vscode/history?page=3&page_size=2").json()["items"] == []


def test_release_history_same_day_matches_authority_order_without_pins(admin):
    app = software(admin)
    first = publish(admin, draft(admin, slug="same-day-first", kind="release", software_id=app["id"], version="2.0", official_release_date="2026-09-20", is_pinned=True))
    second = publish(admin, draft(admin, slug="same-day-second", kind="release", software_id=app["id"], version="2.1", official_release_date="2026-09-20"))
    history = admin.get("/api/v1/software/vscode/history").json()
    assert [row["id"] for row in history["items"]] == [second["id"], first["id"]]
    assert admin.get("/api/v1/software/vscode").json()["latest_version"] == "2.1"


def test_release_history_empty_validation_and_unpublished_404(admin):
    app = software(admin)
    assert admin.get("/api/v1/software/vscode/history").json() == {"items": [], "total": 0, "page": 1, "page_size": 12}
    assert admin.get("/api/v1/software/unknown/history").status_code == 404
    for query in ("page=0", "page=10001", "page_size=0", "page_size=101"):
        assert admin.get("/api/v1/software/vscode/history?" + query).status_code == 422
    publish(admin, draft(admin, slug="history-hidden", kind="release", software_id=app["id"], version="2.0"))
    assert admin.delete(f"/api/v1/admin/software/{app['id']}").status_code == 200
    assert admin.get("/api/v1/software/vscode/history").status_code == 404


def test_historical_demo_seed_backfills_without_overwriting_admin_changes(admin, database, monkeypatch):
    with monkeypatch.context() as original_seed:
        original_seed.setattr("app.seed_updates.EXAMPLES", [entry for entry in EXAMPLES if not entry.get("history_before")])
        with database() as db:
            seed(db)
    anchor = admin.get("/api/v1/updates/demo-vscode-release").json()
    title = "管理员修改后的演示标题"
    assert admin.patch(f"/api/v1/admin/updates/{anchor['id']}", json={"title": title}).status_code == 200
    assert admin.patch(f"/api/v1/admin/software/{anchor['software_id']}", json={"latest_version": "DEMO 管理员维护版本"}).status_code == 200
    with database() as db:
        assert seed_updates(db) == 3
        assert seed_updates(db) == 0
    page = admin.get("/api/v1/software/vscode/history").json()
    assert page["total"] == 4
    assert [row["version"] for row in page["items"]] == ["DEMO 1.2", "DEMO 1.1", "DEMO 1.0", "DEMO 0.9"]
    assert all(row["is_demo"] for row in page["items"])
    assert all(row["official_release_date"] < "2026-09-21" for row in page["items"][1:])
    assert admin.get("/api/v1/updates/demo-vscode-release").json()["title"] == title
    assert admin.get("/api/v1/software/vscode").json()["latest_version"] == "DEMO 管理员维护版本"


def test_history_seed_does_not_change_real_software(admin, database, monkeypatch):
    with monkeypatch.context() as original_seed:
        original_seed.setattr("app.seed_updates.EXAMPLES", [entry for entry in EXAMPLES if not entry.get("history_before")])
        with database() as db:
            seed(db)
    app = admin.get("/api/v1/software/vscode").json()
    assert admin.patch(f"/api/v1/admin/software/{app['id']}", json={"is_demo": False, "latest_version": "real-current"}).status_code == 200
    with database() as db:
        assert seed_updates(db) == 0
    assert admin.get("/api/v1/software/vscode/history").json()["total"] == 1
    assert admin.get("/api/v1/software/vscode").json()["latest_version"] == "real-current"


def test_history_seed_preserves_unpublished_anchor(admin, database, monkeypatch):
    app = software(admin, is_demo=True, latest_version="DEMO 管理员草稿基线")
    anchor = draft(admin, slug="demo-vscode-release", kind="release", software_id=app["id"], is_demo=True, version="DEMO 1.2", official_release_date="2026-09-21")
    monkeypatch.setattr("app.seed_updates.EXAMPLES", [entry for entry in EXAMPLES if entry.get("history_before")])
    with database() as db:
        assert seed_updates(db) == 0
    assert admin.get("/api/v1/software/vscode/history").json()["total"] == 0
    assert admin.get(f"/api/v1/admin/updates/{anchor['id']}").json()["status"] == "draft"
    assert admin.get("/api/v1/software/vscode").json()["latest_version"] == "DEMO 管理员草稿基线"


def test_explicit_historical_backfill_never_changes_current_facts_or_pointer(admin):
    app = software(admin)
    current = publish(admin, draft(admin, slug="explicit-current", kind="release", software_id=app["id"], version="3.0", official_release_date="2026-09-20"))
    before = admin.get("/api/v1/software/vscode").json()
    assert before["current_release_id"] == current["id"]
    for slug, day in (("same-day-history", "2026-09-20"), ("later-day-history", "2026-09-22")):
        historical = publish(admin, draft(admin, slug=slug, kind="release", software_id=app["id"], version="1.0", official_release_date=day, is_historical=True, update_level="hold", reason_to_update="历史建议，不应改当前建议"))
        assert historical["is_historical"] is True
        assert admin.patch(f"/api/v1/admin/updates/{historical['id']}", json={"version": "1.1"}).status_code == 200
        assert admin.patch(f"/api/v1/admin/updates/{historical['id']}", json={"is_historical": False}).status_code == 409
    undated = draft(admin, slug="undated-history", kind="release", software_id=app["id"], version="0.9", is_historical=True)
    assert admin.post(f"/api/v1/admin/updates/{undated['id']}/publish", json={"confirmed": True}).status_code == 422
    invalid_kind = draft(admin, slug="invalid-historical-kind", is_historical=True, official_release_date="2026-09-01")
    assert admin.post(f"/api/v1/admin/updates/{invalid_kind['id']}/publish", json={"confirmed": True}).status_code == 422
    after = admin.get("/api/v1/software/vscode").json()
    for field in ("latest_version", "update_level", "update_reason", "is_demo", "current_release_id", "updated_at"):
        assert after[field] == before[field]
    assert admin.get("/api/v1/software/vscode/current-release").json()["id"] == current["id"]
    assert admin.patch(f"/api/v1/admin/updates/{current['id']}", json={"is_historical": True}).status_code == 409
    assert admin.get("/api/v1/updates").json()["total"] == 1
    assert admin.get("/api/v1/updates?include_historical=true").json()["total"] == 3
    assert admin.get("/api/v1/software/vscode/updates").json()["total"] == 1
    assert admin.get("/api/v1/software/vscode/updates?include_historical=true").json()["total"] == 3
    assert admin.get("/api/v1/updates", params={"software_ids": app["id"]}).json()["total"] == 1
    assert admin.get("/api/v1/software/vscode/history").json()["total"] == 3
    assert admin.get("/api/v1/updates/same-day-history").status_code == 200
    shared = admin.get(f"/api/v1/admin/updates/{historical['id']}/notification").json()["text"]
    assert shared.startswith("历史版本记录 · 非当前更新建议")


def test_current_release_pointer_visibility_and_manual_fact_mismatch(admin, database):
    app = software(admin)
    assert admin.get("/api/v1/software/vscode/current-release").json() is None
    assert admin.get("/api/v1/software/not-found/current-release").status_code == 404
    current = publish(admin, draft(admin, slug="pointer-current", kind="release", software_id=app["id"], version="3.0"))
    assert admin.get("/api/v1/software/vscode/current-release").json()["id"] == current["id"]
    assert admin.patch(f"/api/v1/admin/software/{app['id']}", json={"current_release_id": current["id"]}).status_code == 422
    assert admin.patch(f"/api/v1/admin/software/{app['id']}", json={"latest_version": "manual-override"}).status_code == 200
    assert admin.get("/api/v1/software/vscode/current-release").json() is None
    assert admin.patch(f"/api/v1/admin/software/{app['id']}", json={"latest_version": "3.0", "is_demo": True}).status_code == 200
    assert admin.get("/api/v1/software/vscode/current-release").json() is None
    assert admin.patch(f"/api/v1/admin/software/{app['id']}", json={"is_demo": False}).status_code == 200
    assert admin.post(f"/api/v1/admin/updates/{current['id']}/archive").status_code == 200
    archived_facts = admin.get("/api/v1/software/vscode").json()
    assert archived_facts["current_release_id"] == current["id"] and archived_facts["latest_version"] == "3.0"
    assert admin.get("/api/v1/software/vscode/current-release").json() is None
    publish(admin, current)
    assert admin.get("/api/v1/software/vscode/current-release").json()["id"] == current["id"]
    # Defense in depth: a corrupted cross-software pointer must not disclose data.
    other = software(admin, slug="other-pointer")
    with database() as db:
        db.get(Software, other["id"]).current_release_id = current["id"]
        db.get(Software, other["id"]).latest_version = "3.0"
        db.commit()
    assert admin.get("/api/v1/software/other-pointer/current-release").json() is None
    admin.delete(f"/api/v1/admin/software/{app['id']}")
    assert admin.get("/api/v1/software/vscode/current-release").status_code == 404


def test_admin_version_history_all_states_and_invalid_publish_preserves_pointer(admin, database):
    app = software(admin)
    current = publish(admin, draft(admin, slug="workbench-current", kind="release", software_id=app["id"], version="3.0", official_release_date="2026-09-21"))
    for state in ("draft", "review"):
        draft(admin, slug="workbench-" + state, kind="release", software_id=app["id"], version="1.0", status=state, is_historical=True)
    archived = publish(admin, draft(admin, slug="workbench-archived", kind="release", software_id=app["id"], version="2.0", is_historical=True, official_release_date="2026-09-20"))
    admin.post(f"/api/v1/admin/updates/{archived['id']}/archive")
    publish(admin, draft(admin, slug="workbench-notice", software_id=app["id"]))
    path = f"/api/v1/admin/software/{app['id']}/history"
    records = admin.get(path + "?page_size=2").json()
    assert records["total"] == 4 and len(records["items"]) == 2
    for state in ("draft", "review", "published", "archived"):
        selected = admin.get(path, params={"status": state}).json()
        assert selected["total"] == 1 and selected["items"][0]["status"] == state
    assert admin.get(path + "?status=invalid").status_code == 422
    assert admin.get("/api/v1/admin/software/missing/history").status_code == 404
    pending = draft(admin, slug="stale-source", kind="release", software_id=app["id"], version="4.0")
    with database() as db:
        db.get(OfficialLink, app["official_links"][0]["id"]).is_active = False
        db.commit()
    before_audit = admin.get("/api/v1/admin/audit").json()["total"]
    assert admin.post(f"/api/v1/admin/updates/{pending['id']}/publish", json={"confirmed": True}).status_code == 422
    facts = admin.get("/api/v1/software/vscode").json()
    assert facts["current_release_id"] == current["id"] and facts["latest_version"] == "3.0"
    assert admin.get("/api/v1/admin/audit").json()["total"] == before_audit
    admin.delete(f"/api/v1/admin/software/{app['id']}")
    assert admin.get(path).status_code == 200


@pytest.mark.parametrize("manual_change", [{"latest_version": "manual-4"}, {"update_level": "hold"}, {"update_reason": "管理员独立核验的建议"}, {"is_demo": True}])
def test_published_copy_edits_cannot_overwrite_independently_maintained_facts(admin, manual_change):
    app = software(admin)
    current = publish(admin, draft(admin, slug="manual-provenance", kind="release", software_id=app["id"], version="3.0"))
    assert admin.patch(f"/api/v1/admin/software/{app['id']}", json=manual_change).status_code == 200
    before = admin.get(f"/api/v1/admin/software/{app['id']}").json()
    assert admin.get("/api/v1/software/vscode/current-release").json() is None
    audit_before = admin.get("/api/v1/admin/audit?page_size=100").json()["items"]
    updated = admin.patch(f"/api/v1/admin/updates/{current['id']}", json={"title": "公告文字更正", "summary": "仅补充文字，不应更改管理员独立维护的数据"})
    assert updated.status_code == 200
    after = admin.get(f"/api/v1/admin/software/{app['id']}").json()
    for field in ("latest_version", "update_level", "update_reason", "is_demo", "current_release_id", "updated_at"):
        assert after[field] == before[field]
    assert admin.get("/api/v1/software/vscode/current-release").json() is None
    audit_after = admin.get("/api/v1/admin/audit?page_size=100").json()["items"]
    assert sum(row["action"] == "sync_version" for row in audit_after) == sum(row["action"] == "sync_version" for row in audit_before)
    assert any(row["action"] == "update" and row["resource_id"] == current["id"] and row["payload"]["after"]["title"] == "公告文字更正" for row in audit_after)
    # A separate, explicit administrator publication may establish facts again.
    publish(admin, current)
    restored = admin.get(f"/api/v1/admin/software/{app['id']}").json()
    assert restored["latest_version"] == "3.0" and restored["current_release_id"] == current["id"] and restored["is_demo"] is False
    assert admin.get("/api/v1/software/vscode/current-release").json()["id"] == current["id"]
