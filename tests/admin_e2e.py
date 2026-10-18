"""Exercise admin workflows against running local servers.

Run with E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD or --credentials PATH.
Credentials are read in-process and are never written to test output.
"""

import argparse
import io
import json
import os
from pathlib import Path
import re
import uuid
from urllib.parse import urlsplit

from PIL import Image
from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=os.getenv("E2E_BASE_URL", "http://localhost:3000"))
    parser.add_argument("--credentials", type=Path, default=ROOT / "runtime" / "local-admin.json")
    parser.add_argument("--browser", default=os.getenv("E2E_BROWSER_PATH"), help="Optional browser executable; defaults to installed Edge or bundled Chromium")
    args = parser.parse_args()
    email, password = os.getenv("E2E_ADMIN_EMAIL"), os.getenv("E2E_ADMIN_PASSWORD")
    if not (email and password):
        credentials = json.loads(args.credentials.read_text(encoding="utf-8-sig"))
        email, password = credentials["email"], credentials["password"]
    base = args.base_url.rstrip("/")
    if urlsplit(base).hostname not in {"localhost", "127.0.0.1", "::1"}:
        parser.error("Fixture-creating acceptance is restricted to a local test service.")
    token = uuid.uuid4().hex[:10]
    slug, name = f"e2e-admin-{token}", f"E2E 验证软件 {token}"
    category_name, category_slug = f"E2E 验证分类 {token}", f"e2e-category-{token}"
    alias, revised_alias = f"e2ealias{token}", f"e2erevised{token}"
    artifacts = ROOT / "artifacts"
    artifacts.mkdir(exist_ok=True)
    checks, errors, cleanup_errors, created_id, category_id = [], [], [], None, None
    succeeded, failure = False, None
    launch_options = {"headless": True}
    if args.browser:
        executable = Path(args.browser).expanduser()
        if not executable.is_file():
            parser.error("--browser / E2E_BROWSER_PATH must identify an existing browser executable")
        launch_options["executable_path"] = str(executable.resolve())
    else:
        edge = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
        if edge.is_file():
            launch_options["executable_path"] = str(edge)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(**launch_options)
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="zh-CN")
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))

        def go(path):
            response = page.goto(base + path)
            page.wait_for_load_state("networkidle")
            return response

        def assert_no_overflow():
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Page overflows horizontally"

        def get_api(path):
            response = context.request.get(base + "/api/v1" + path)
            assert response.ok, f"Read failed: {path}: {response.status}"
            return response.json()

        def mutate(path, method, payload=None):
            csrf = get_api("/admin/auth/me")["csrf_token"]
            return context.request.fetch(base + "/api/v1" + path, method=method, data=payload, headers={"X-CSRF-Token": csrf})

        try:
            go("/admin")
            page.wait_for_url("**/admin/login")
            expect(page.get_by_role("heading", name="管理员登录")).to_be_visible()
            assert page.locator('input[name="email"]').count() == 1
            page.get_by_label("邮箱", exact=True).fill(email)
            page.get_by_label("密码", exact=True).fill(password)
            page.get_by_role("button", name="登录管理后台").click()
            page.wait_for_url(re.compile(r"/admin/?$"))
            page.get_by_role("navigation", name="后台导航").get_by_role("link", name="软件管理", exact=True).click()
            expect(page.get_by_role("heading", name="软件管理", exact=True)).to_be_visible()
            checks.append("UI authentication and protected route")

            page.get_by_role("link", name="添加软件", exact=True).first.click()
            expect(page.get_by_role("heading", name="添加软件", exact=True)).to_be_visible()
            page.get_by_role("textbox", name=re.compile("^软件名称")).fill(name)
            page.get_by_text("网址高级设置（已自动生成）", exact=True).click()
            page.get_by_role("textbox", name=re.compile("^网址标识")).fill(slug)
            page.get_by_role("textbox", name=re.compile("^一句话简介")).fill("用于验证管理员维护、搜索和官方跳转的测试软件。")
            page.get_by_role("textbox", name=re.compile("^别名与常用叫法")).fill(alias)
            page.get_by_role("checkbox", name="这是演示软件，相关版本默认标记为演示", exact=True).check()
            page.get_by_role("checkbox", name=re.compile("^在公开站点展示")).uncheck()
            page.get_by_label("Windows", exact=True).check()
            page.get_by_role("button", name="保存软件并管理版本", exact=True).click()
            page.wait_for_url(re.compile(r"/admin/software/[^/?]+/versions\?created=1$"))
            created_id = page.url.split("/admin/software/")[1].split("/")[0]
            draft = get_api(f"/admin/software/{created_id}")
            assert draft["published"] is False and draft["platforms"] == ["windows"]
            assert alias in draft["aliases"]
            checks.append("Create draft with aliases and canonical platform")

            go("/admin/categories")
            page.locator('[name="name"]').fill(category_name)
            page.locator('[name="slug"]').fill(category_slug)
            page.get_by_role("button", name="添加分类", exact=True).click()
            expect(page.get_by_role("status").filter(has_text="已添加")).to_be_visible()
            category_id = next(item["id"] for item in get_api("/categories") if item["slug"] == category_slug)
            checks.append("Create category through admin form")

            go(f"/admin/software/{created_id}")
            expect(page.get_by_role("heading", name="编辑软件", exact=True)).to_be_visible()
            page.locator('[name="category_id"]').select_option(category_id)
            page.locator('[name="purposes"]').fill("验证官方入口，搜索测试")
            page.locator('[name="tags"]').fill("E2E，测试资料")
            page.locator('[name="website_url"]').fill("https://example.com")
            image_bytes = io.BytesIO()
            Image.new("RGB", (80, 80), (20, 125, 112)).save(image_bytes, format="PNG")
            page.locator('input[type="file"]').set_input_files({"name": "e2e-icon.png", "mimeType": "image/png", "buffer": image_bytes.getvalue()})
            expect(page.get_by_role("status").filter(has_text="图标已上传")).to_be_visible()
            expect(page.locator('[name="icon_url"]')).to_have_value(re.compile(r"/uploads/[a-f0-9]+\.png"))
            page.get_by_role("button", name="添加入口", exact=True).click()
            link = page.locator(".adm-link-editor").first
            link.get_by_label("显示名称", exact=False).fill("E2E Windows 官方下载")
            link.get_by_label("官方地址", exact=False).fill(f"https://example.com/download/{slug}")
            link.get_by_label("适用平台", exact=False).select_option("windows")
            link.get_by_label("处理器架构", exact=False).select_option("x64")
            page.get_by_label("在公开站点展示", exact=False).check()
            page.get_by_role("button", name="保存软件资料", exact=True).click()
            expect(page.get_by_role("status").filter(has_text="公开页面已更新")).to_be_visible()
            published = get_api(f"/admin/software/{created_id}")
            assert published["published"] and published["icon_url"].startswith("/uploads/")
            assert published["official_links"][0]["platform"] == "windows"
            checks.append("Upload validated icon and publish official link/category/platform data")
            original_links = published["official_links"]
            page.get_by_role("button", name="保存软件资料", exact=True).click()
            expect(page.get_by_role("status").filter(has_text="软件资料已保存")).to_be_visible()
            assert get_api(f"/admin/software/{created_id}")["official_links"] == original_links
            checks.append("No-op save preserves this run's official links")

            public = context.new_page()
            public.goto(f"{base}/software?q={alias}")
            public.wait_for_load_state("networkidle")
            expect(public.get_by_role("link", name=name, exact=True)).to_be_visible()
            page.locator('[name="aliases"]').fill(revised_alias)
            link.get_by_label("官方地址", exact=False).fill(f"https://example.com/releases/{slug}")
            page.get_by_role("button", name="保存软件资料", exact=True).click()
            expect(page.get_by_role("status").filter(has_text="公开页面已更新")).to_be_visible()
            public.goto(f"{base}/software?q={revised_alias}")
            public.wait_for_load_state("networkidle")
            expect(public.get_by_role("link", name=name, exact=True)).to_be_visible()
            assert not get_api(f"/search?q={alias}")["items"]
            latest = get_api(f"/software/{slug}")
            redirect = context.request.get(base + "/go/" + latest["official_links"][0]["id"], max_redirects=0)
            assert redirect.status == 302 and redirect.headers["location"] == f"https://example.com/releases/{slug}"
            checks.append("Alias edits update public search and URL edits update official redirect")

            go("/admin/software")
            expect(page.locator(".adm-table")).to_be_visible()
            assert_no_overflow()
            page.screenshot(path=str(artifacts / "admin-desktop.png"), full_page=True)
            page.set_viewport_size({"width": 375, "height": 900})
            assert_no_overflow()
            page.screenshot(path=str(artifacts / "admin-mobile-375.png"), full_page=True)
            go(f"/admin/software/{created_id}")
            expect(page.get_by_role("heading", name="编辑软件", exact=True)).to_be_visible()
            assert_no_overflow()
            page.locator('[name="short_name"]').fill("E2E Mobile")
            page.get_by_role("button", name="保存软件资料", exact=True).click()
            expect(page.get_by_role("status").filter(has_text="公开页面已更新")).to_be_visible()
            assert get_api(f"/admin/software/{created_id}")["short_name"] == "E2E Mobile"
            page.screenshot(path=str(artifacts / "admin-editor-mobile-375.png"), full_page=True)
            checks.append("375px list/editor without page overflow and successful mobile form save")

            go("/admin/software")
            page.get_by_role("textbox", name="搜索软件", exact=True).fill(name)
            page.get_by_role("button", name="搜索", exact=True).click()
            page.get_by_role("button", name=f"下线 {name}", exact=True).click()
            expect(page.get_by_role("dialog")).to_be_visible()
            page.get_by_role("button", name="确认下线", exact=True).click()
            expect(page.get_by_role("status").filter(has_text="已下线")).to_be_visible()
            assert get_api(f"/admin/software/{created_id}")["published"] is False
            response = public.goto(f"{base}/software/{slug}")
            public.wait_for_load_state("networkidle")
            assert context.request.get(base + "/api/v1/software/" + slug).status == 404
            expect(public.get_by_role("heading", name="没有找到这个页面", exact=True)).to_be_visible()
            assert "noindex" in public.locator('meta[name="robots"]').first.get_attribute("content")
            # Next.js can stream the loading boundary with HTTP 200 before notFound() resolves.
            assert response.status in (200, 404)
            checks.append("Explicit soft-unpublish, public API 404 and noindex not-found page")

            go("/admin/audit")
            expect(page.get_by_role("heading", name="操作日志", exact=True)).to_be_visible()
            matching = page.locator(".adm-audit-entry").filter(has_text=created_id).first
            matching.locator("summary").click()
            expect(matching.locator("pre")).to_be_visible()
            assert_no_overflow()
            checks.append("Audit details visible after data changes")

            # Remove the test category after detaching the retained, unpublished test software.
            assert mutate(f"/admin/software/{created_id}", "PATCH", {"category_id": None}).ok
            assert mutate(f"/admin/categories/{category_id}", "DELETE").ok
            category_id = None
            page.get_by_role("button", name="退出登录", exact=True).click()
            page.wait_for_url("**/admin/login")
            assert context.request.get(base + "/api/v1/admin/auth/me").status == 401
            checks.append("Logout invalidates server session")
            assert not errors, "Browser errors: " + " | ".join(errors)
            succeeded = True
        except Exception as exc:
            failure = str(exc)
            page.screenshot(path=str(artifacts / "admin-e2e-failure.png"), full_page=True)
            print("Admin E2E failed after checks: " + "; ".join(checks))
            raise
        finally:
            # Keep software as an unpublished record; never delete non-E2E data.
            if created_id:
                try:
                    current_session = context.request.get(base + "/api/v1/admin/auth/me")
                    if current_session.ok:
                        assert mutate(f"/admin/software/{created_id}", "DELETE").ok
                        if category_id:
                            assert mutate(f"/admin/software/{created_id}", "PATCH", {"category_id": None}).ok
                            assert mutate(f"/admin/categories/{category_id}", "DELETE").ok
                        assert mutate("/admin/auth/logout", "POST").ok
                except Exception as exc:
                    cleanup_errors.append(str(exc))
            report = {"passed": succeeded and not cleanup_errors, "checks": checks, "failure": failure, "screenshots": ["admin-desktop.png", "admin-mobile-375.png", "admin-editor-mobile-375.png"], "retained_unpublished_test_slug": slug, "browser_errors": errors, "cleanup_errors": cleanup_errors}
            (artifacts / "admin-e2e-result.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            print(json.dumps(report, ensure_ascii=False, indent=2))
            context.close()
            browser.close()
            if cleanup_errors and succeeded:
                raise RuntimeError("Test fixture cleanup failed")


if __name__ == "__main__":
    main()
