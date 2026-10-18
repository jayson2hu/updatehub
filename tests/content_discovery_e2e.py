"""Visible-UI acceptance for content publishing, finder, onboarding and collections.

All software/content fixtures are created, published and unpublished through UI.
API access only reads facts and removes this run's fixtures in finally.
Run against already-running localhost services; credentials are never reported.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
from urllib.parse import urlsplit
import uuid

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts"
EDGE = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=os.getenv("E2E_BASE_URL", "http://localhost:3000"))
    parser.add_argument("--credentials", type=Path, default=ROOT / "runtime/local-admin.json")
    args = parser.parse_args()
    base = args.base_url.rstrip("/")
    if urlsplit(base).hostname not in {"localhost", "127.0.0.1", "::1"}:
        parser.error("Fixture-creating acceptance is restricted to localhost.")
    email, password = os.getenv("E2E_ADMIN_EMAIL"), os.getenv("E2E_ADMIN_PASSWORD")
    if not (email and password):
        credentials = json.loads(args.credentials.read_text(encoding="utf-8-sig"))
        email, password = credentials["email"], credentials["password"]
    OUT.mkdir(exist_ok=True)
    token = uuid.uuid4().hex[:8]
    purpose = "演示写作验收" + token
    software, documents, checks, errors, cleanup_errors, screenshots = [], [], [], [], [], []
    success, failure = False, None

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, **({"executable_path": str(EDGE)} if EDGE.is_file() else {}))
        admin = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="zh-CN")
        visitor = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="zh-CN")
        newcomer = browser.new_context(viewport={"width": 393, "height": 852}, locale="zh-CN")
        page, public, first_time = admin.new_page(), visitor.new_page(), newcomer.new_page()
        for current in (page, public, first_time):
            current.on("pageerror", lambda error: errors.append(str(error)))

        def go(active, path):
            response = active.goto(base + path)
            active.wait_for_load_state("networkidle")
            return response

        def read(path):
            response = admin.request.get(base + "/api/v1" + path)
            assert response.ok, f"Read {path}: {response.status}"
            return response.json()

        def clean(path, action="archive"):
            me = read("/admin/auth/me")
            response = admin.request.post(base + "/api/v1" + path + "/" + action, data={}, headers={"X-CSRF-Token": me["csrf_token"]})
            assert response.ok, f"Cleanup {path}: {response.status}"

        def capture(active, name):
            active.wait_for_load_state("networkidle")
            assert active.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), f"Horizontal overflow: {name}"
            active.screenshot(path=str(OUT / name), full_page=True)
            screenshots.append(name)

        def admin_section(label):
            nav = page.get_by_role("navigation", name="后台导航", exact=True)
            target = nav.get_by_role("link", name=label, exact=True)
            if not target.is_visible():
                page.get_by_role("button", name="指南、问题与更多管理", exact=True).click()
            target.click()
            page.wait_for_load_state("networkidle")

        try:
            go(page, "/")
            page.get_by_role("link", name="管理入口", exact=False).first.click()
            page.get_by_label("邮箱", exact=True).fill(email)
            page.get_by_label("密码", exact=True).fill(password)
            page.get_by_role("button", name="登录管理后台", exact=True).click()
            page.wait_for_url(re.compile(r"/admin/?$"))
            expect(page.get_by_role("heading", name="运营工作台", exact=True)).to_be_visible()
            checks.append("Homepage visible admin entry opens authenticated operations workbench")

            for index, platform in enumerate(("Windows", "macOS")):
                admin_section("软件管理")
                page.get_by_role("link", name="添加软件", exact=True).first.click()
                page.get_by_role("textbox", name=re.compile("^软件名称")).fill(f"演示场景工具 {token} {platform}")
                page.get_by_role("textbox", name=re.compile("^一句话简介")).fill("用于界面验收，不代表真实软件或厂商建议。")
                page.get_by_role("textbox", name=re.compile("^官方网站")).fill(f"https://example.com/content-acceptance/{token}/{index}")
                page.get_by_role("textbox", name=re.compile("^别名与常用叫法")).fill("场景别名" + token + str(index))
                page.get_by_role("textbox", name=re.compile("^用途")).fill(purpose)
                page.get_by_role("checkbox", name="这是演示软件，相关版本默认标记为演示", exact=True).check()
                page.get_by_role("checkbox", name=platform, exact=True).check()
                with page.expect_response(lambda r: r.url.endswith("/api/v1/admin/software") and r.request.method == "POST") as created:
                    page.get_by_role("button", name="保存软件并管理版本", exact=True).click()
                assert created.value.ok
                software.append(created.value.json())
                page.wait_for_url(re.compile(r"/admin/software/[^/?]+/versions\?created=1$"))
            checks.append("Two published demo software fixtures created entirely through visible forms")

            for kind, heading, new_label, title_label, summary_label, body_label, public_path in (
                ("guide", "指南管理", "新建指南", "指南标题", "简介", "正文", "guide"),
                ("faq", "常见问题", "添加问题", "问题", "简短回答", "详细解答", "faq"),
                ("collection", "合集管理", "新建合集", "合集名称", "适合什么需求", "选择与使用说明", "collection"),
            ):
                label = {"guide": "指南", "faq": "常见问题", "collection": "合集"}[kind]
                title = f"演示{label}验收 {token}"
                admin_section(heading)
                page.get_by_role("link", name=new_label, exact=True).first.click()
                page.get_by_role("textbox", name=re.compile("^" + title_label)).fill(title)
                page.get_by_role("textbox", name=re.compile("^" + summary_label)).fill("这是一条只用于验收的演示内容，请勿当作真实操作建议。")
                page.get_by_role("textbox", name=re.compile("^" + body_label)).fill("先确认软件来源，再按团队要求核对操作。\n演示步骤仅用于验证阅读与维护流程。")
                page.get_by_role("checkbox", name="这是演示内容", exact=True).check()
                if kind != "collection":
                    page.get_by_role("combobox", name=re.compile("^关联软件")).select_option(software[0]["id"])
                if kind == "guide":
                    page.get_by_role("button", name="添加步骤", exact=True).click()
                    page.get_by_role("textbox", name="步骤标题", exact=True).fill("演示：核对来源")
                    page.get_by_role("textbox", name="操作说明", exact=True).fill("在官方页面确认名称、系统和适用版本。")
                    page.set_viewport_size({"width": 375, "height": 900})
                    capture(page, "content-guide-editor-375.png")
                if kind == "collection":
                    for item in software:
                        page.get_by_role("combobox", name="选择软件", exact=True).select_option(item["id"])
                        page.get_by_role("button", name="加入合集", exact=True).click()
                    page.get_by_role("textbox", name="选择理由 / 使用提示", exact=True).first.fill("用于演示用途匹配与自主选择。")
                    page.get_by_role("button", name="上移 " + software[1]["name"], exact=True).click()
                    page.get_by_role("textbox", name=re.compile("^适用用途")).fill(purpose)
                    page.get_by_role("checkbox", name="Windows", exact=True).check()
                    page.get_by_role("checkbox", name="macOS", exact=True).check()
                with page.expect_response(lambda r: r.url.endswith("/api/v1/admin/content") and r.request.method == "POST") as saved:
                    page.get_by_role("button", name="保存并预览", exact=True).click()
                assert saved.value.ok, f"Save {kind}: {saved.value.status}"
                document = saved.value.json()
                documents.append(document)
                preview = page.get_by_role("dialog", name=f"确认发布这条{label}？", exact=True)
                expect(preview).to_be_visible()
                assert read("/admin/content/" + document["id"])["status"] == "draft"
                api_directory = {"guide": "guides", "faq": "faq", "collection": "collections"}[kind]
                assert admin.request.get(f"{base}/api/v1/{api_directory}/{document['slug']}").status == 404
                if kind == "guide":
                    page.keyboard.press("Escape")
                    expect(preview).not_to_be_visible()
                    page.get_by_role("button", name="保存并预览", exact=True).click()
                    expect(preview).to_be_visible()
                preview.get_by_role("button", name="确认发布" + label, exact=True).click()
                expect(page.get_by_role("status").filter(has_text=label + "已发布")).to_be_visible()
                expect(page.get_by_role("textbox", name=re.compile("^" + title_label))).to_be_disabled()
                assert read("/admin/content/" + document["id"])["status"] == "published"
                with page.expect_popup() as published:
                    page.get_by_role("link", name="查看公开页面", exact=True).click()
                publication = published.value
                publication.wait_for_load_state("networkidle")
                expect(publication.get_by_role("heading", name=title, exact=True)).to_be_visible()
                assert "noindex" in publication.locator('meta[name="robots"]').first.get_attribute("content")
                publication.close()
                document["admin_url"] = page.url
                document["public_path"] = f"/{public_path}/{document['slug']}"
                if kind == "collection":
                    actual = read("/collections/" + document["slug"])
                    assert [member["software_id"] for member in actual["items"]] == [software[1]["id"], software[0]["id"]]
                checks.append(f"{label}: UI draft → private preview → explicit publish → public page; published editor locked")
                page.set_viewport_size({"width": 1440, "height": 1000})

            go(public, "/finder")
            field = public.get_by_role("searchbox", name="描述用途或软件线索", exact=True)
            field.fill(purpose)
            field.press("Enter")
            expect(public.get_by_role("link", name=software[0]["name"], exact=True)).to_be_visible()
            expect(public.get_by_role("link", name=software[1]["name"], exact=True)).to_be_visible()
            public.get_by_role("combobox", name="使用系统", exact=True).select_option("windows")
            public.get_by_role("button", name="按条件查找", exact=True).click()
            expect(public.get_by_role("link", name=software[0]["name"], exact=True)).to_be_visible()
            expect(public.get_by_role("link", name=software[1]["name"], exact=True)).not_to_be_visible()
            expect(field).to_have_value(purpose)
            field.fill("never-found-" + token)
            field.press("Enter")
            expect(public.get_by_role("heading", name="暂时没有找到匹配的软件", exact=True)).to_be_visible()
            expect(public.get_by_role("link", name="浏览全部软件", exact=True)).to_be_visible()
            checks.append("Finder purpose search, keyboard submit, system filter retention and actionable empty state")

            go(public, "/faq")
            public.get_by_role("searchbox", name="搜索常见问题", exact=True).fill(token)
            public.get_by_role("button", name="搜索", exact=True).click()
            expect(public.locator("details").filter(has_text=documents[1]["title"])).to_have_attribute("open", "")
            public.get_by_role("link", name="查看完整回答", exact=True).click()
            expect(public.get_by_role("heading", name=documents[1]["title"], exact=True)).to_be_visible()
            checks.append("FAQ search reveals the matching answer and opens its detail")

            go(public, documents[2]["public_path"])
            expect(public.get_by_role("button", name="关注选中的 0 款软件", exact=True)).to_be_disabled()
            public.get_by_role("combobox", name="合集适用系统", exact=True).select_option("windows")
            expect(public.get_by_role("checkbox", name="选择 " + software[1]["name"], exact=True)).not_to_be_visible()
            chosen = public.get_by_role("checkbox", name="选择 " + software[0]["name"], exact=True)
            chosen.focus()
            chosen.press("Space")
            public.get_by_role("button", name="关注选中的 1 款软件", exact=True).click()
            expect(public.get_by_role("status").filter(has_text="已将 1 款软件加入我的关注")).to_be_visible()
            public.get_by_role("link", name="查看我的关注", exact=True).click()
            public.wait_for_url("**/my-software")
            public.reload()
            expect(public.get_by_role("link", name=software[0]["name"], exact=True)).to_be_visible()
            expect(public.get_by_role("link", name=software[1]["name"], exact=True)).not_to_be_visible()
            checks.append("Collection system filter and keyboard checkbox persist only explicitly selected software")

            go(first_time, "/start")
            first_time.get_by_role("button", name=re.compile("^Windows")).click()
            first_time.get_by_role("button", name="下一步：选择用途", exact=True).click()
            expect(first_time.get_by_role("heading", name="你主要用电脑做什么？", exact=True)).to_be_focused()
            first_time.get_by_role("button", name=purpose, exact=True).click()
            first_time.get_by_role("button", name="查看适合的软件", exact=True).click()
            expect(first_time.get_by_role("button", name="关注选中的 0 款软件", exact=True)).to_be_disabled()
            first_time.get_by_role("checkbox", name="选择 " + software[0]["name"], exact=True).check()
            first_time.get_by_role("button", name="关注选中的 1 款软件", exact=True).click()
            capture(first_time, "onboarding-complete-393.png")
            first_time.get_by_role("link", name="查看我的关注", exact=True).click()
            first_time.wait_for_url("**/my-software")
            first_time.reload()
            expect(first_time.get_by_role("link", name=software[0]["name"], exact=True)).to_be_visible()
            checks.append("393px three-step onboarding moves focus, requires user choice and persists following")

            for width in (375, 393):
                public.set_viewport_size({"width": width, "height": 900})
                for route, label in (("/finder", "finder"), ("/faq?q=" + token, "faq"), (documents[0]["public_path"], "guide"), (documents[2]["public_path"], "collection")):
                    go(public, route)
                    capture(public, f"content-{label}-{width}.png")
                menu = public.get_by_role("button", name="打开导航", exact=True)
                menu.focus()
                menu.press("Enter")
                expect(public.get_by_role("navigation", name="手机导航", exact=True)).to_be_visible()
                public.keyboard.press("Escape")
                expect(menu).to_be_focused()
            checks.append("375px and 393px finder/FAQ/guide/collection have no page overflow; mobile navigation keyboard/Escape works")

            for document in documents:
                page.goto(document["admin_url"])
                page.wait_for_load_state("networkidle")
                page.get_by_role("button", name="下线后编辑", exact=True).first.click()
                page.get_by_role("button", name="确认下线并编辑", exact=True).click()
                expect(page.get_by_role("status").filter(has_text="内容已回到草稿")).to_be_visible()
                go(public, document["public_path"])
                expect(public.get_by_role("heading", name="没有找到这个页面", exact=True)).to_be_visible()
                assert "noindex" in public.locator('meta[name="robots"]').first.get_attribute("content")
                assert read("/admin/content/" + document["id"])["status"] == "draft"
            checks.append("UI unpublish hides all three content kinds from their public detail pages")
            assert not errors, "Browser errors: " + " | ".join(errors)
            success = True
        except Exception as exc:
            failure = str(exc)
            page.screenshot(path=str(OUT / "content-discovery-failure-admin.png"), full_page=True)
            public.screenshot(path=str(OUT / "content-discovery-failure-public.png"), full_page=True)
            raise
        finally:
            for document in documents:
                try:
                    clean("/admin/content/" + document["id"])
                except Exception as exc:
                    cleanup_errors.append(str(exc))
            for item in software:
                try:
                    me = read("/admin/auth/me")
                    response = admin.request.delete(base + "/api/v1/admin/software/" + item["id"], headers={"X-CSRF-Token": me["csrf_token"]})
                    assert response.ok
                except Exception as exc:
                    cleanup_errors.append(str(exc))
            try:
                me = read("/admin/auth/me")
                assert admin.request.post(base + "/api/v1/admin/auth/logout", headers={"X-CSRF-Token": me["csrf_token"]}).ok
            except Exception as exc:
                cleanup_errors.append(str(exc))
            report = {"passed": success and not cleanup_errors, "tested_at": datetime.now(timezone.utc).isoformat(), "checks": checks, "failure": failure, "screenshots": screenshots, "browser_errors": errors, "cleanup_errors": cleanup_errors, "test_software_slugs": [item["slug"] for item in software], "test_content_slugs": [item["slug"] for item in documents]}
            (OUT / "content-discovery-e2e.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            print(json.dumps(report, ensure_ascii=False, indent=2))
            admin.close()
            visitor.close()
            newcomer.close()
            browser.close()
            if success and cleanup_errors:
                raise RuntimeError("Fixture cleanup failed")


if __name__ == "__main__":
    main()
