"""Verify the announcement publishing workflow on running local servers.

Uses E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD or --credentials; never prints secrets.
Test announcements are archived, and the test software is unpublished afterward.
"""

import argparse
import json
import os
from pathlib import Path
import re
import uuid

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=os.getenv("E2E_BASE_URL", "http://localhost:3000"))
    parser.add_argument("--credentials", type=Path, default=ROOT / "runtime" / "local-admin.json")
    parser.add_argument("--browser", default=os.getenv("E2E_BROWSER_PATH"))
    args = parser.parse_args()
    email, password = os.getenv("E2E_ADMIN_EMAIL"), os.getenv("E2E_ADMIN_PASSWORD")
    if not (email and password):
        credentials = json.loads(args.credentials.read_text(encoding="utf-8-sig"))
        email, password = credentials["email"], credentials["password"]
    launch = {"headless": True}
    if args.browser:
        path = Path(args.browser).expanduser()
        if not path.is_file():
            parser.error("--browser / E2E_BROWSER_PATH must point to an existing browser executable")
        launch["executable_path"] = str(path.resolve())
    else:
        edge = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
        if edge.is_file():
            launch["executable_path"] = str(edge)
    base, token = args.base_url.rstrip("/"), uuid.uuid4().hex[:10]
    slug, title = f"e2e-announcement-{token}", f"E2E 更新公告 {token}"
    software_id, created_updates, checks, errors = None, [], [], []
    artifacts = ROOT / "artifacts"
    artifacts.mkdir(exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(**launch)
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="zh-CN", permissions=["clipboard-read", "clipboard-write"])
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))

        def go(path):
            response = page.goto(base + path)
            page.wait_for_load_state("networkidle")
            return response

        def get(path):
            response = context.request.get(base + "/api/v1" + path)
            assert response.ok, f"API GET failed {path}: {response.status}"
            return response.json()

        def mutate(path, method, payload=None):
            csrf = get("/admin/auth/me")["csrf_token"]
            return context.request.fetch(base + "/api/v1" + path, method=method, data=payload, headers={"X-CSRF-Token": csrf})

        def no_overflow():
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Horizontal page overflow"

        try:
            go("/admin")
            page.wait_for_url("**/admin/login")
            page.get_by_label("邮箱", exact=True).fill(email)
            page.get_by_label("密码", exact=True).fill(password)
            page.get_by_role("button", name="登录管理后台").click()
            page.wait_for_url(re.compile(r"/admin/?$"))
            page.get_by_role("navigation", name="后台导航").get_by_role("link", name="公告管理", exact=True).click()
            expect(page.get_by_role("heading", name="公告管理", exact=True)).to_be_visible()
            checks.append("Admin login reaches workbench and announcement management is visible")

            response = mutate("/admin/software", "POST", {"name": f"E2E 公告关联软件 {token}", "slug": f"e2e-announcement-software-{token}", "summary": "公告发布同步验证软件", "published": True, "is_demo": True, "latest_version": "1.0-e2e", "platforms": ["windows"], "official_links": [{"label": "E2E 官方下载", "url": "https://example.com/download", "is_active": True, "is_primary": True}]})
            assert response.ok, "Cannot create test software"
            software_id = response.json()["id"]
            page.get_by_role("link", name="新建公告", exact=True).first.click()
            expect(page.get_by_role("heading", name="新建公告", exact=True)).to_be_visible()
            page.locator('[name="title"]').fill(title)
            page.locator(".adm-workflow-details > summary").click()
            page.locator('[name="slug"]').fill(slug)
            page.locator('[name="summary"]').fill("新版修复连接稳定性问题，请受影响用户在工作完成后更新。")
            page.locator('[name="content"]').fill('本次更新调整连接方式。<img src=x onerror="window.__announcement_xss=1"> 为纯文本示例。')
            page.locator('[name="who_should_update"]').fill("使用 Windows 旧版客户端的用户。")
            page.locator('[name="reason_to_update"]').fill("请保存工作后更新，以减少连接中断。")
            page.locator('[name="kind"]').select_option("release")
            page.locator('[name="software_id"]').select_option(software_id)
            expect(page.locator('[name="is_demo"]')).to_be_checked()
            page.locator('[name="version"]').fill("2.0-e2e")
            page.locator('[name="previous_version"]').fill("1.0-e2e")
            page.locator('[name="changes"]').fill("修复连接中断\n改善配置检查")
            page.locator('[name="update_level"]').select_option("recommended")
            page.get_by_role("button", name="保存草稿", exact=True).click()
            page.wait_for_url(re.compile(r"/admin/updates/[^/?]+\?saved=1$"))
            update_id = page.url.split("/admin/updates/")[1].split("?")[0]
            created_updates.append(update_id)
            expect(page.get_by_role("heading", name="编辑版本公告", exact=True)).to_be_visible()
            assert get(f"/admin/updates/{update_id}")["status"] == "draft"
            assert get(f"/admin/software/{software_id}")["latest_version"] == "1.0-e2e"
            assert context.request.get(base + "/api/v1/updates/" + slug).status == 404
            checks.append("Draft stays private and does not alter current software version")

            page.get_by_role("button", name="预览内容", exact=True).click()
            expect(page.get_by_role("dialog")).to_be_visible()
            expect(page.get_by_role("dialog").get_by_role("heading", name=title, exact=True)).to_be_visible()
            expect(page.get_by_role("dialog").get_by_text('<img src=x onerror="window.__announcement_xss=1">', exact=False)).to_be_visible()
            expect(page.get_by_role("dialog").locator('img[src="x"]')).to_have_count(0)
            assert page.evaluate("window.__announcement_xss || 0") == 0
            page.get_by_role("button", name="继续编辑", exact=True).click()
            page.locator('[name="status"]').select_option("review")
            page.get_by_role("button", name="保存为待审核", exact=True).click()
            expect(page.get_by_role("status").filter(has_text="草稿已保存")).to_be_visible()
            assert get(f"/admin/updates/{update_id}")["status"] == "review"
            page.get_by_role("button", name="保存并预览", exact=True).click()
            expect(page.get_by_role("heading", name="确认发布这条公告？", exact=True)).to_be_visible()
            assert get(f"/admin/updates/{update_id}")["status"] == "review"
            page.get_by_role("button", name="确认发布公告", exact=True).click()
            expect(page.get_by_role("status").filter(has_text="公告已发布")).to_be_visible()
            assert get(f"/admin/software/{software_id}")["latest_version"] == "2.0-e2e"
            assert get(f"/updates/{slug}")["status"] == "published"
            expect(page.locator('[name="kind"]')).to_be_disabled()
            expect(page.locator('[name="software_id"]')).to_be_disabled()
            expect(page.locator('[name="official_release_date"]')).to_be_disabled()
            checks.append("Safe preview, review state, explicit manual publication and software version synchronization")

            for format_name in ("plain", "markdown"):
                page.get_by_label("复制格式", exact=False).select_option(format_name)
                page.get_by_role("button", name="生成并复制", exact=True).click()
                expect(page.get_by_role("status").filter(has_text="群通知已复制")).to_be_visible()
                copied = page.evaluate("navigator.clipboard.readText()")
                normalized = re.sub(r"\\(.)", r"\1", copied) if format_name == "markdown" else copied
                assert title in normalized and "2.0-e2e" in normalized and "/update/" + slug in normalized
                if format_name == "markdown":
                    assert copied.startswith("**")
            checks.append("Real clipboard receives plain text and Markdown notification")

            page.locator('[name="reason_to_update"]').fill("更新后的行动建议：请先备份配置，再更新客户端。")
            page.get_by_role("button", name="保存并更新公告", exact=True).click()
            expect(page.get_by_role("status").filter(has_text="公开内容和群通知已同步更新")).to_be_visible()
            assert "先备份配置" in get(f"/updates/{slug}")["reason_to_update"]
            assert "先备份配置" in get(f"/admin/updates/{update_id}/notification?format=plain")["text"]
            checks.append("Published edits retain publication and synchronize public content and notification")

            go("/admin/updates")
            page.get_by_role("textbox", name="搜索公告", exact=True).fill(token)
            page.get_by_role("button", name="搜索", exact=True).click()
            expect(page.get_by_role("link", name=title, exact=True)).to_be_visible()
            page.get_by_role("combobox", name="公告状态筛选", exact=True).select_option("published")
            expect(page.get_by_role("link", name=title, exact=True)).to_be_visible()
            no_overflow()
            page.screenshot(path=str(artifacts / "announcements-admin-desktop.png"), full_page=True)
            page.set_viewport_size({"width": 375, "height": 900})
            no_overflow()
            page.screenshot(path=str(artifacts / "announcements-admin-mobile-375.png"), full_page=True)
            go(f"/admin/updates/{update_id}")
            expect(page.get_by_role("heading", name="编辑版本公告", exact=True)).to_be_visible()
            no_overflow()
            page.get_by_role("button", name="预览内容", exact=True).click()
            no_overflow()
            page.screenshot(path=str(artifacts / "announcements-preview-mobile-375.png"), full_page=True)
            page.get_by_role("button", name="继续编辑", exact=True).click()
            page.get_by_role("button", name="归档这条公告", exact=True).click()
            expect(page.get_by_role("heading", name="归档这条公告？", exact=True)).to_be_visible()
            page.get_by_role("button", name="确认归档", exact=True).click()
            expect(page.get_by_role("status").filter(has_text="公告已归档")).to_be_visible()
            assert context.request.get(base + "/api/v1/updates/" + slug).status == 404
            assert context.request.get(base + f"/api/v1/admin/updates/{update_id}/notification").status == 409
            assert get(f"/admin/software/{software_id}")["latest_version"] == "2.0-e2e"
            checks.append("375px management/preview and confirmed archive hide public content without version rollback")

            go("/admin/updates/new")
            expect(page.get_by_role("heading", name="新建公告", exact=True)).to_be_visible()
            page.locator('[name="title"]').fill(f"E2E 维护通知 {token}")
            page.locator(".adm-workflow-details > summary").click()
            page.locator('[name="slug"]').fill(f"e2e-maintenance-{token}")
            page.locator('[name="summary"]').fill("服务维护期间可能短暂不可用。")
            page.locator('[name="content"]').fill("维护计划、预计时长与后续说明。")
            page.locator('[name="who_should_update"]').fill("全部站点用户。")
            page.locator('[name="reason_to_update"]').fill("请稍后重试，维护结束后会恢复服务。")
            page.locator('[name="kind"]').select_option("maintenance")
            page.locator('[name="is_demo"]').check()
            page.get_by_role("button", name="保存草稿", exact=True).click()
            page.wait_for_url(re.compile(r"/admin/updates/[^/?]+\?saved=1$"))
            maintenance_id = page.url.split("/admin/updates/")[1].split("?")[0]
            created_updates.append(maintenance_id)
            page.get_by_role("button", name="保存并预览", exact=True).click()
            page.get_by_role("button", name="确认发布公告", exact=True).click()
            expect(page.get_by_role("status").filter(has_text="公告已发布")).to_be_visible()
            assert get(f"/updates/e2e-maintenance-{token}")["software_id"] is None
            checks.append("Sitewide maintenance announcement publishes without associated software or version")
            assert not errors, "Browser errors: " + " | ".join(errors)
            report = {"passed": True, "checks": checks, "browser_errors": errors, "screenshots": ["announcements-admin-desktop.png", "announcements-admin-mobile-375.png", "announcements-preview-mobile-375.png"]}
            (artifacts / "announcements-admin-e2e-result.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            print(json.dumps(report, ensure_ascii=False, indent=2))
        except Exception:
            page.screenshot(path=str(artifacts / "announcements-admin-e2e-failure.png"), full_page=True)
            print("Announcement admin E2E failed after: " + "; ".join(checks))
            raise
        finally:
            for update_id in created_updates:
                try:
                    mutate(f"/admin/updates/{update_id}/archive", "POST", {})
                except Exception:
                    pass
            if software_id:
                try:
                    mutate(f"/admin/software/{software_id}", "DELETE")
                except Exception:
                    pass
            context.close()
            browser.close()


if __name__ == "__main__":
    main()
