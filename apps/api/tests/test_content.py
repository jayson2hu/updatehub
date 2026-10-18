import pytest
from sqlalchemy import func, select

from app.models import AuditLog, ContentDocument, Software
from app.seed import seed
from app.seed_content import seed_content


def software(admin, slug="content-editor", **overrides):
    response = admin.post("/api/v1/admin/software", json={"name": "内容编辑器", "slug": slug, "published": True, "platforms": ["windows"], "purposes": ["写代码"], "aliases": ["蓝色编辑器"], "official_links": [{"label": "官网", "url": "https://example.com/"}], **overrides})
    assert response.status_code == 201, response.text
    return response.json()


def draft(admin, **overrides):
    response = admin.post("/api/v1/admin/content", json={"kind": "guide", "slug": "first-guide", "title": "第一次使用指南", "summary": "先确认自己的需求", "content": "阅读官方说明后，再进行实际操作。", **overrides})
    assert response.status_code == 201, response.text
    return response.json()


def publish(admin, item):
    response = admin.post(f"/api/v1/admin/content/{item['id']}/publish", json={"confirmed": True})
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize(("kind", "route"), [("guide", "guides"), ("faq", "faq"), ("collection", "collections")])
def test_explicit_publish_lifecycle_and_audit(admin, database, kind, route):
    data = {"kind": kind}
    if kind == "collection":
        data["items"] = [{"software_id": software(admin)["id"]}]
    item = draft(admin, **data)
    path = f"/api/v1/admin/content/{item['id']}"
    public = f"/api/v1/{route}/{item['slug']}"
    assert admin.get(public).status_code == 404
    assert admin.get(f"/api/v1/{route}").json()["total"] == 0
    assert admin.post(path + "/publish", json={"confirmed": False}).status_code == 422
    assert admin.patch(path, json={"status": "published"}).status_code == 422
    published = publish(admin, item)
    assert published["published_at"].endswith("Z")
    assert admin.get(public).status_code == 200
    assert admin.get(f"/api/v1/{route}").json()["total"] == 1
    assert admin.patch(path, json={"content": "无确认修改"}).status_code == 409
    assert admin.post(path + "/unpublish").json()["status"] == "draft"
    assert admin.get(public).status_code == 404
    changed = admin.patch(path, json={"content": "重新核验后的说明"})
    assert changed.status_code == 200 and changed.json()["title"] == item["title"]
    assert publish(admin, item)["published_at"] == published["published_at"]
    assert admin.delete(path).json()["status"] == "archived"
    assert admin.get(public).status_code == 404
    assert admin.get(path).json()["status"] == "archived"
    assert admin.patch(path, json={"title": "不能直接修改归档"}).status_code == 409
    with database() as db:
        actions = db.scalars(select(AuditLog).where(AuditLog.resource_id == item["id"]).order_by(AuditLog.created_at)).all()
        assert [row.action for row in actions] == ["create", "publish", "unpublish", "update", "publish", "archive"]
        assert all(row.admin_user_id for row in actions)
        assert actions[2].payload["before"]["status"] == "published"
        assert actions[2].payload["after"]["status"] == "draft"


def test_content_auth_csrf_and_untrusted_origin(client):
    assert client.get("/api/v1/admin/content").status_code == 401
    assert client.get("/api/v1/admin/content/missing").status_code == 401
    assert client.post("/api/v1/admin/content", json={"kind": "faq", "title": "问题", "slug": "question"}).status_code == 401
    login = client.post("/api/v1/admin/auth/login", json={"email": "admin@example.com", "password": "test-admin-password-123"}).json()
    assert client.post("/api/v1/admin/content", json={"kind": "faq", "title": "问题", "slug": "question"}).status_code == 403
    client.headers["X-CSRF-Token"] = login["csrf_token"]
    item = draft(client)
    path = f"/api/v1/admin/content/{item['id']}"
    assert client.post(path + "/publish", json={"confirmed": True}, headers={"Origin": "https://evil.example"}).status_code == 403
    client.headers.pop("X-CSRF-Token")
    for action in ("publish", "unpublish", "archive"):
        assert client.post(path + "/" + action, json={"confirmed": True} if action == "publish" else {}).status_code == 403


def test_partial_guide_steps_and_type_validation(admin):
    item = draft(admin, content="", sections=[{"title": "准备", "body": ""}])
    path = f"/api/v1/admin/content/{item['id']}"
    assert admin.post(path + "/publish", json={"confirmed": True}).status_code == 422
    partial = admin.patch(path, json={"sections": [{"title": "只有标题"}]})
    assert partial.status_code == 200 and partial.json()["sections"][0]["body"] == ""
    assert admin.post(path + "/publish", json={"confirmed": True}).status_code == 422
    assert admin.patch(path, json={"sections": [{"title": "准备", "body": "检查官方文档"}]}).status_code == 200
    assert publish(admin, item)["content"] == ""
    faq = draft(admin, kind="faq", slug="incomplete-answer", content="", summary="")
    assert admin.post(f"/api/v1/admin/content/{faq['id']}/publish", json={"confirmed": True}).status_code == 422
    assert admin.patch(f"/api/v1/admin/content/{faq['id']}", json={"kind": "guide"}).status_code == 422
    assert admin.patch(f"/api/v1/admin/content/{faq['id']}", json={"content": "答案", "sections": [{"title": "不能有步骤", "body": "正文"}]}).status_code == 422
    assert admin.get(f"/api/v1/admin/content/{faq['id']}").json()["content"] == ""
    assert admin.patch(f"/api/v1/admin/content/{faq['id']}", json={"content": "完整答案"}).status_code == 200
    assert publish(admin, faq)["summary"] == ""


def test_association_visibility_and_demo_constraints(admin):
    app = software(admin, published=False, is_demo=True)
    item = draft(admin, software_id=app["id"], is_demo=True)
    path = f"/api/v1/admin/content/{item['id']}"
    assert admin.post(path + "/publish", json={"confirmed": True}).status_code == 422
    assert admin.patch(f"/api/v1/admin/software/{app['id']}", json={"published": True}).status_code == 200
    publish(admin, item)
    assert admin.get("/api/v1/guides?software_id=" + app["id"]).json()["total"] == 1
    assert admin.delete(f"/api/v1/admin/software/{app['id']}").status_code == 200
    assert admin.get("/api/v1/guides/first-guide").status_code == 404
    assert admin.get("/api/v1/guides").json()["total"] == 0
    assert admin.get("/api/v1/admin/content").json()["total"] == 1
    bad = draft(admin, slug="demo-must-be-labeled", software_id=app["id"])
    admin.patch(f"/api/v1/admin/software/{app['id']}", json={"published": True})
    assert admin.post(f"/api/v1/admin/content/{bad['id']}/publish", json={"confirmed": True}).status_code == 422


def test_collection_member_ownership_reorder_and_public_filter(admin):
    first = software(admin, slug="first")
    second = software(admin, slug="second", platforms=["linux"])
    third = software(admin, slug="third", platforms=["web"])
    item = draft(admin, kind="collection", items=[{"software_id": first["id"], "sort_order": 5, "note": "先准备"}, {"software_id": second["id"], "sort_order": 2}, {"software_id": third["id"], "sort_order": 5}])
    assert [member["software_id"] for member in item["items"]] == [second["id"], first["id"], third["id"]]
    assert [member["sort_order"] for member in item["items"]] == [0, 1, 2]
    members = [{key: member[key] for key in ("id", "software_id", "importance", "note")} | {"sort_order": index} for index, member in enumerate(reversed(item["items"]))]
    path = f"/api/v1/admin/content/{item['id']}"
    reordered = admin.patch(path, json={"items": members}).json()
    assert [member["id"] for member in reordered["items"]] == [member["id"] for member in reversed(item["items"])]
    alien = draft(admin, kind="collection", slug="other-collection", items=[{"software_id": first["id"]}])
    assert admin.patch(path, json={"items": [{"id": alien["items"][0]["id"], "software_id": first["id"]}]}).status_code == 422
    assert admin.patch(path, json={"items": [{"id": item["items"][0]["id"], "software_id": first["id"]}]}).status_code == 422
    assert admin.patch(path, json={"items": [{"software_id": first["id"]}, {"software_id": first["id"]}]}).status_code == 422
    publish(admin, item)
    admin.delete(f"/api/v1/admin/software/{second['id']}")
    public = admin.get("/api/v1/collections/first-guide").json()
    assert [member["software_id"] for member in public["items"]] == [third["id"], first["id"]]
    assert second["id"] not in str(public)
    assert admin.get("/api/v1/collections", params={"software_id": second["id"]}).json()["total"] == 0
    assert len(admin.get(path).json()["items"]) == 3
    admin.delete(f"/api/v1/admin/software/{first['id']}")
    admin.delete(f"/api/v1/admin/software/{third['id']}")
    assert admin.get("/api/v1/collections/first-guide").status_code == 404
    assert admin.get("/api/v1/collections").json()["total"] == 0


def test_content_filters_exact_arrays_and_category_use(admin):
    category = admin.post("/api/v1/admin/categories", json={"name": "操作入门", "slug": "starter"}).json()
    app = software(admin)
    item = draft(admin, purposes=["普通办公"], platforms=["web"], category_id=category["id"])
    publish(admin, item)
    collection = draft(admin, kind="collection", slug="dev-kit", title="开发工具清单", purposes=["开发编程"], items=[{"software_id": app["id"]}])
    publish(admin, collection)
    assert admin.get("/api/v1/guides?platform=web&purpose=普通办公&category=starter&q=使用").json()["total"] == 1
    assert admin.get("/api/v1/guides?purpose=办公").json()["total"] == 0
    assert admin.get("/api/v1/guides?platform=windows&purpose=普通办公").json()["total"] == 0
    assert admin.get("/api/v1/collections?platform=windows&purpose=开发编程").json()["total"] == 1
    assert admin.get("/api/v1/collections?platform=linux&purpose=开发编程").json()["total"] == 0
    assert admin.get("/api/v1/collections?purpose=写代码").json()["total"] == 1
    assert admin.delete(f"/api/v1/admin/categories/{category['id']}").status_code == 409
    assert admin.get("/api/v1/guides?page_size=0").status_code == 422
    assert admin.get("/api/v1/admin/content?kind=faq").json()["total"] == 0
    assert admin.get("/api/v1/admin/content?status=published&page_size=1&page=2").json()["total"] == 2
    assert admin.get("/api/v1/faq/first-guide").status_code == 404


def test_failed_relations_and_duplicate_slug_leave_no_partial_audits(admin, database):
    item = draft(admin)
    path = f"/api/v1/admin/content/{item['id']}"
    with database() as db:
        count = db.scalar(select(func.count()).select_from(AuditLog))
    assert admin.patch(path, json={"title": "不应保存", "software_id": "missing"}).status_code == 422
    assert admin.patch(path, json={"category_id": "missing"}).status_code == 422
    assert admin.post("/api/v1/admin/content", json={"kind": "faq", "slug": item["slug"], "title": "重复"}).status_code == 409
    assert admin.get(path).json()["title"] == item["title"]
    with database() as db:
        assert db.scalar(select(func.count()).select_from(AuditLog)) == count
        assert db.scalar(select(func.count()).select_from(ContentDocument)) == 1


def test_content_search_includes_step_text_and_only_visible_software(admin):
    app = software(admin, name="Unique Editor", short_name="UEdit", aliases=["蓝色钢笔"])
    secret = software(admin, slug="private-member", name="SecretMember", aliases=["隐藏别名"])
    guide = draft(admin, software_id=app["id"], content="", sections=[{"title": "准备环境", "body": "完成独立运行检查"}])
    publish(admin, guide)
    for query in ("准备环境", "独立运行检查", "unique", "uedit", "蓝色钢笔"):
        assert admin.get("/api/v1/guides", params={"q": query}).json()["total"] == 1
    assert admin.get("/api/v1/guides?q=body").json()["total"] == 0
    collection = draft(admin, kind="collection", slug="visible-kit", items=[{"software_id": app["id"]}, {"software_id": secret["id"]}])
    publish(admin, collection)
    assert admin.get("/api/v1/collections?q=SecretMember").json()["total"] == 1
    admin.delete(f"/api/v1/admin/software/{secret['id']}")
    assert admin.get("/api/v1/collections?q=SecretMember").json()["total"] == 0
    assert admin.get("/api/v1/collections?q=隐藏别名").json()["total"] == 0
    assert admin.get("/api/v1/admin/content?q=SecretMember").json()["total"] == 1


def test_content_seed_is_useful_idempotent_and_preserves_admin_edits(database):
    with database() as db:
        seed(db)
        assert seed_content(db) == 19
        assert seed_content(db) == 0
        docs = db.scalars(select(ContentDocument)).all()
        assert sum(row.kind == "guide" for row in docs) == 4
        assert sum(row.kind == "faq" for row in docs) == 10
        assert sum(row.kind == "collection" for row in docs) == 5
        assert {purpose for row in docs if row.kind == "collection" for purpose in row.purposes} == {"开发编程", "普通办公", "设计创作", "学习", "综合使用"}
        doc = docs[0]
        doc.title = "管理员自己的标题"
        doc.status = "draft"
        db.commit()
        assert seed_content(db) == 0
        db.refresh(doc)
        assert doc.title == "管理员自己的标题" and doc.status == "draft"


def test_finder_uses_registered_descriptions_without_changing_search(admin):
    app = software(admin)
    recorder = software(admin, slug="recorder", name="Recorder", aliases=["录屏"], purposes=["录制屏幕"], platforms=["linux"])
    software(admin, slug="git", name="Git", aliases=[], purposes=[])
    assert admin.get("/api/v1/search?q=我想写代码").json()["total"] == 0
    assert admin.get("/api/v1/finder?q=我想写代码").json()["items"][0]["id"] == app["id"]
    assert admin.get("/api/v1/finder?q=帮我找个录屏工具").json()["items"][0]["id"] == recorder["id"]
    assert admin.get("/api/v1/finder?q=帮我找个录屏工具&platform=windows").json()["total"] == 0
    assert admin.get("/api/v1/finder?q=digital workflow").json()["total"] == 0
    assert admin.get("/api/v1/finder?q=I need Git please").json()["total"] == 1
    admin.delete(f"/api/v1/admin/software/{recorder['id']}")
    assert admin.get("/api/v1/finder?q=帮我找个录屏工具").json()["total"] == 0
