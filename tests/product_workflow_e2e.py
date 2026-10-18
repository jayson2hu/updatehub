"""Task acceptance through visible UI, against already-running local services.

All software and announcement creation, editing and publishing use browser UI.
API requests only read facts, check redirects, or clean up this run's fixtures.
External example.com navigation is fulfilled locally; no vendor facts are claimed.
"""
import argparse
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit
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
        parser.error("Fixture-creating acceptance is restricted to a local test service.")
    email, password = os.getenv("E2E_ADMIN_EMAIL"), os.getenv("E2E_ADMIN_PASSWORD")
    if not (email and password):
        credentials = json.loads(args.credentials.read_text(encoding="utf-8-sig"))
        email, password = credentials["email"], credentials["password"]
    OUT.mkdir(exist_ok=True)
    token = uuid.uuid4().hex[:8]
    name = f"演示验收工具 {token}"
    alias = f"蓝色演示助手{token}"
    official_url = f"https://example.com/product-workflow/{token}"
    day = "2020-01-02"
    checks, errors, cleanup_errors, created_updates = [], [], [], []
    software, csrf, failure = None, None, None
    succeeded = False

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, **({"executable_path": str(EDGE)} if EDGE.exists() else {}))
        admin = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="zh-CN", timezone_id="Asia/Shanghai", permissions=["clipboard-read", "clipboard-write"])
        page = admin.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))

        def read(path):
            response = admin.request.get(base + "/api/v1" + path)
            assert response.ok, f"Read {path} returned {response.status}"
            return response.json()

        def settle(active):
            active.wait_for_load_state("networkidle")

        def navigate(active, label):
            desktop = active.get_by_role("navigation", name="主导航", exact=True)
            if desktop.is_visible():
                desktop.get_by_role("link", name=label, exact=True).click()
            else:
                active.get_by_role("button", name="打开导航", exact=True).click()
                active.get_by_role("navigation", name="手机导航", exact=True).get_by_role("link", name=label, exact=True).click()

        def search_announcements(active, query):
            active.get_by_role("searchbox", name="搜索公告或软件", exact=True).fill(query)
            active.get_by_role("button", name="搜索公告", exact=True).click()
            expect(active.get_by_role("searchbox", name="搜索公告或软件", exact=True)).to_have_value(query)
            expect(active.get_by_text(f"搜索“{query}”", exact=True)).to_be_visible()
            settle(active)

        def current_fact(version, update_id):
            actual = read("/software/" + software["slug"])
            assert actual["latest_version"] == version, "The software current version changed unexpectedly"
            assert actual["current_release_id"] == update_id, "Current release identity changed unexpectedly"
            assert actual["update_reason"].startswith(version), "A historical recommendation replaced the current one"
            assert actual["update_level"] == "recommended"
            assert read("/software/" + software["slug"] + "/current-release")["id"] == update_id

        def release(version, historical=False, fail_save=False):
            entry = "补录历史版本" if historical else "发布新版本"
            page.get_by_role("link", name=re.compile("^" + entry)).click()
            expect(page.get_by_label(re.compile("^本次公告版本"))).to_be_visible()
            expect(page.get_by_text(re.compile("^" + re.escape(name) + " · 档案当前版本："))).to_be_visible()
            expect(page.get_by_text(re.compile("已关联这款软件"))).to_be_visible()
            expect(page.get_by_role("checkbox", name="标记为演示公告", exact=True)).to_be_checked()
            if historical:
                expect(page.get_by_role("checkbox", name="这是历史补录，不更新档案当前版本", exact=True)).to_be_checked()
                expect(page.get_by_label(re.compile("^上一版本"))).to_have_value("")
            else:
                expect(page.get_by_label(re.compile("^上一版本"))).to_have_value("" if version == "DEMO 2.0" else "DEMO 2.0")
            title = f"{name} · {version} {'历史补录' if historical else '更新公告'}"
            page.get_by_label(re.compile("^本次公告版本")).fill(version)
            page.get_by_label(re.compile("^公告标题")).fill(title)
            page.get_by_label(re.compile("^摘要")).fill("仅用于任务验收的演示公告，不对应真实厂商版本。")
            page.get_by_label(re.compile("^公告正文")).fill("演示流程：阅读影响和建议，核对官方来源后再决定操作。")
            page.get_by_label(re.compile("^影响范围")).fill("演示场景：使用验收工具的测试成员。")
            page.get_by_label(re.compile("^行动建议")).fill(f"{version} 演示建议：先保存设置，再在测试环境验证。")
            page.get_by_label("主要变化", exact=True).fill("演示变化：增加人工检查步骤。\n演示变化：保留版本追溯记录。")
            page.get_by_role("combobox", name="重要程度 / 处理建议", exact=True).select_option(label="一般通知" if historical else "建议处理")
            # A missing history date must be discoverable and fixable in-place.
            if historical:
                page.get_by_role("button", name="保存并预览", exact=True).click()
                expect(page.get_by_label(re.compile("^官方发布日期"))).to_have_attribute("aria-invalid", "true")
                expect(page.get_by_role("dialog", name="确认发布这条公告？", exact=True)).not_to_be_visible()
                expect(page.get_by_label(re.compile("^公告标题"))).to_have_value(title)
                checks.append({"task": "补录缺日期", "outcome": "定位官方发布日期，阻止发布并保留已填写内容"})
            page.get_by_label(re.compile("^官方发布日期")).fill(day)
            if fail_save:
                def fail_once(route):
                    if route.request.method == "POST":
                        route.fulfill(status=503, content_type="application/json", body=json.dumps({"detail": "保存暂时失败，请重试。"}, ensure_ascii=False))
                    else:
                        route.continue_()
                page.route("**/api/v1/admin/updates", fail_once)
                page.get_by_role("button", name="保存并预览", exact=True).click()
                expect(page.get_by_role("alert").filter(has_text="保存暂时失败，请重试。")).to_be_visible()
                expect(page.get_by_label(re.compile("^公告标题"))).to_have_value(title)
                expect(page.get_by_label(re.compile("^本次公告版本"))).to_have_value(version)
                page.unroute("**/api/v1/admin/updates", fail_once)
                checks.append({"task": "保存故障恢复", "outcome": "模拟一次503，表单保留内容并通过同一保存按钮重试"})
            with page.expect_response(lambda response: response.url.endswith("/api/v1/admin/updates") and response.request.method == "POST") as saved_response:
                page.get_by_role("button", name="保存并预览", exact=True).click()
            assert saved_response.value.ok, f"UI draft save returned {saved_response.value.status}"
            saved = saved_response.value.json()
            created_updates.append(saved["id"])
            assert saved["software_id"] == software["id"]
            preview = page.get_by_role("dialog", name="确认发布这条公告？", exact=True)
            expect(preview).to_be_visible()
            expect(preview).to_contain_text(version)
            expect(preview).to_contain_text(day)
            if historical:
                expect(preview).to_contain_text("当前版本保持不变")
            # Previewing alone is not publication.
            assert read("/admin/updates/" + saved["id"])["status"] == "draft"
            with page.expect_response(lambda response: response.url.endswith("/" + saved["id"] + "/publish") and response.request.method == "POST") as published_response:
                preview.get_by_role("button", name="确认发布公告", exact=True).click()
            assert published_response.value.ok, f"UI publish returned {published_response.value.status}"
            published = published_response.value.json()
            expect(preview).not_to_be_visible()
            expect(page.get_by_role("status").filter(has_text="历史版本已补录" if historical else "公告已发布")).to_be_visible()
            if historical:
                page.get_by_role("button", name="生成并复制", exact=True).click()
                expect(page.get_by_role("textbox", name="通知内容", exact=True)).to_have_value(re.compile("历史"))
                expect(page.get_by_role("textbox", name="通知内容", exact=True)).to_have_value(re.compile("演示"))
            page.get_by_role("link", name="返回版本管理", exact=True).first.click()
            expect(page.get_by_role("heading", name=name + " · 版本管理", exact=True)).to_be_visible()
            expect(page.get_by_role("link", name=version, exact=True)).to_be_visible()
            return published

        try:
            page.goto(base)
            settle(page)
            page.get_by_role("link", name="管理入口", exact=True).click()
            expect(page.get_by_role("heading", name="管理员登录", exact=True)).to_be_visible()
            page.get_by_label("邮箱", exact=True).fill(email)
            page.get_by_label("密码", exact=True).fill(password)
            with page.expect_response(lambda response: response.url.endswith("/admin/auth/login") and response.request.method == "POST") as login_response:
                page.get_by_role("button", name="登录管理后台", exact=True).click()
            assert login_response.value.ok, "Administrator UI login failed"
            csrf = login_response.value.json()["csrf_token"]
            page.get_by_role("navigation", name="后台导航", exact=True).get_by_role("link", name="软件管理", exact=True).click()
            page.get_by_role("link", name="添加软件", exact=True).click()
            expect(page.get_by_role("heading", name="添加软件", exact=True)).to_be_visible()
            page.get_by_label(re.compile("^软件名称")).fill(name)
            page.get_by_label(re.compile("^一句话简介")).fill("用于检查完整管理与访客流程的演示工具。")
            page.get_by_label(re.compile("^官方网站")).fill(official_url)
            page.get_by_role("checkbox", name="这是演示软件，相关版本默认标记为演示", exact=True).check()
            page.get_by_label(re.compile("^别名与常用叫法")).fill(alias)
            page.get_by_role("checkbox", name="Windows", exact=True).check()
            with page.expect_response(lambda response: response.url.endswith("/api/v1/admin/software") and response.request.method == "POST") as software_response:
                page.get_by_role("button", name="保存软件并管理版本", exact=True).click()
            assert software_response.value.ok, f"UI software save returned {software_response.value.status}"
            software = software_response.value.json()
            expect(page.get_by_role("heading", name=name + " · 版本管理", exact=True)).to_be_visible()
            assert software["is_demo"] and software["published"] and software["official_links"]
            checks.append({"task": "添加软件", "outcome": "从首页登录，通过表单保存演示软件；自动生成网址和官方入口，直接进入版本管理"})

            first = release("DEMO 2.0", fail_save=True)
            current_fact("DEMO 2.0", first["id"])
            checks.append({"task": "发布首版", "outcome": "保存预览仍为草稿；人工确认后当前版本和公告同步为DEMO 2.0"})
            old = release("DEMO 1.0", historical=True)
            assert old["official_release_date"] == first["official_release_date"] and old["is_historical"]
            current_fact("DEMO 2.0", first["id"])
            checks.append({"task": "同日补录旧版", "outcome": "DEMO 1.0加入历史，DEMO 2.0当前版本与公告依据保持；历史群通知明确演示与历史属性"})
            latest = release("DEMO 3.0")
            current_fact("DEMO 3.0", latest["id"])
            page.screenshot(path=str(OUT / "product-workflow-admin-versions.png"), full_page=True)
            checks.append({"task": "发布下一版", "outcome": "上一版本自动带入DEMO 2.0；同日新版本DEMO 3.0成为当前记录"})

            visitor = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="zh-CN", timezone_id="Asia/Shanghai")
            public = visitor.new_page()
            public.on("pageerror", lambda error: errors.append(str(error)))
            public.goto(base)
            settle(public)
            search_announcements(public, alias)
            expect(public.get_by_role("link", name=latest["title"], exact=True)).to_be_visible()
            expect(public.get_by_role("link", name=old["title"], exact=True)).to_have_count(0)
            public.get_by_text("筛选软件与建议", exact=False).first.click()
            public.get_by_role("combobox", name="软件", exact=True).select_option(label=name)
            public.get_by_role("combobox", name="公告重要程度", exact=True).select_option(label="建议关注")
            public.get_by_role("button", name="筛选", exact=True).click()
            expect(public.get_by_role("combobox", name="软件", exact=True)).to_have_value(software["id"])
            public.get_by_role("navigation", name="公告类型", exact=True).get_by_role("link", name="版本更新", exact=True).click()
            expect(public.get_by_role("searchbox", name="搜索公告或软件", exact=True)).to_have_value(alias)
            expect(public.get_by_role("combobox", name="软件", exact=True)).to_have_value(software["id"])
            expect(public.get_by_role("combobox", name="公告重要程度", exact=True)).to_have_value("recommended")
            search_announcements(public, name)
            expect(public.get_by_role("combobox", name="软件", exact=True)).to_have_value(software["id"])
            expect(public.get_by_role("combobox", name="公告重要程度", exact=True)).to_have_value("recommended")
            public.get_by_role("checkbox", name="包含历史版本记录", exact=True).check()
            public.get_by_role("combobox", name="公告重要程度", exact=True).select_option(label="全部建议")
            public.get_by_role("button", name="筛选", exact=True).click()
            expect(public.get_by_role("link", name=old["title"], exact=True)).to_be_visible()
            checks.append({"task": "公告发现与组合筛选", "outcome": "别名和名称均可找到；搜索/类型/软件/建议互相保留；历史默认不混入最新公告，可显式包含"})

            # Change the page parameter on the URL actually obtained through UI.
            parsed = urlsplit(public.url)
            query = parse_qs(parsed.query)
            query["page"] = ["999"]
            public.goto(urlunsplit(parsed._replace(query=urlencode(query, doseq=True))))
            settle(public)
            expect(public.get_by_role("link", name=latest["title"], exact=True)).to_be_visible()
            search_announcements(public, "definitely-absent-" + token)
            expect(public.get_by_role("heading", name="没有找到匹配的公告", exact=True)).to_be_visible()
            public.get_by_role("link", name="查看全部公告", exact=True).click()
            expect(public.get_by_role("searchbox", name="搜索公告或软件", exact=True)).to_have_value("")
            checks.append({"task": "查找失败恢复", "outcome": "当前UI网址的越界页码恢复可读内容；无结果可直接清除条件"})

            navigate(public, "软件档案")
            public.get_by_role("searchbox", name="搜索软件名称、别名或用途", exact=True).fill(alias)
            public.get_by_role("button", name="搜索软件", exact=True).click()
            expect(public.get_by_role("link", name=name, exact=True)).to_be_visible()
            public.get_by_role("link", name=name, exact=True).click()
            expect(public.get_by_role("heading", name=name, exact=True)).to_be_visible()
            current = public.get_by_role("region", name="当前版本与建议", exact=True)
            expect(current).to_contain_text("DEMO 3.0")
            expect(current).to_contain_text("演示")
            expect(current.get_by_role("link", name="阅读当前版本公告", exact=True)).to_be_visible()
            public.get_by_role("navigation", name="软件详情栏目", exact=True).get_by_role("link", name="版本历史", exact=True).click()
            history = public.get_by_role("region", name="版本历史线", exact=True)
            expect(history.get_by_role("link", name="查看 DEMO 1.0 版本公告", exact=True)).to_be_visible()
            history.get_by_role("link", name="查看 DEMO 1.0 版本公告", exact=True).click()
            expect(public.get_by_role("heading", name=old["title"], exact=True)).to_be_visible()
            historical_notice = public.get_by_role("region", name="历史版本提示", exact=True)
            expect(historical_notice).to_contain_text("DEMO 1.0")
            expect(historical_notice).to_contain_text("DEMO 3.0")
            expect(public.get_by_role("heading", name="当时的更新建议", exact=True)).to_be_visible()
            historical_notice.get_by_role("link", name="查看当前版本公告", exact=True).click()
            expect(public.get_by_role("heading", name=latest["title"], exact=True)).to_be_visible()
            expect(public.get_by_role("heading", name="你需要做什么", exact=True)).to_be_visible()
            public.screenshot(path=str(OUT / "product-workflow-public-desktop.png"), full_page=True)
            checks.append({"task": "判断当前并回看旧版", "outcome": "软件首部显示当前3.0；通过历史打开1.0明确是当时建议，再点击回当前公告"})

            public.get_by_role("button", name="关注 " + name, exact=True).click()
            expect(public.get_by_role("button", name="取消关注 " + name, exact=True)).to_have_attribute("aria-pressed", "true")
            expect(public.get_by_role("status").filter(has_text="已关注")).to_be_visible()
            public.get_by_role("link", name="查看我的关注", exact=True).click()
            expect(public.get_by_role("heading", name="我的关注", exact=True)).to_be_visible()
            expect(public.get_by_role("link", name=latest["title"], exact=True)).to_be_visible()
            public.reload()
            expect(public.get_by_role("button", name="取消关注 " + name, exact=True)).to_be_visible()
            expect(public.get_by_role("link", name=latest["title"], exact=True)).to_be_visible()
            public.get_by_role("link", name=latest["title"], exact=True).click()
            expect(public.get_by_role("heading", name=latest["title"], exact=True)).to_be_visible()
            official = public.get_by_role("link", name="前往官方网站", exact=True).first
            href = official.get_attribute("href")
            destination = visitor.request.get(base + href, max_redirects=0)
            assert destination.status == 302 and destination.headers["location"] == official_url
            visitor.route("https://example.com/**", lambda route: route.fulfill(status=200, content_type="text/html", body="<h1>Controlled external navigation target</h1>"))
            with public.expect_popup() as popup:
                official.click()
            expect(popup.value).to_have_url(official_url)
            popup.value.close()
            checks.append({"task": "关注和官方来源", "outcome": "关注反馈直接到我的关注且刷新保留；可见官方按钮经过受控302到精确登记目标，外部内容用本地响应替代"})

            for width in (375, 393):
                mobile = browser.new_context(viewport={"width": width, "height": 812}, locale="zh-CN", is_mobile=True, has_touch=True)
                mp = mobile.new_page()
                mp.on("pageerror", lambda error: errors.append(str(error)))
                mp.goto(base)
                settle(mp)
                search_announcements(mp, alias)
                mp.get_by_role("link", name=latest["title"], exact=True).click()
                expect(mp.get_by_role("heading", name=latest["title"], exact=True)).to_be_visible()
                source = mp.get_by_role("link", name="前往官方网站", exact=True).first
                assert source.bounding_box()["y"] < 812, "Official action is not discoverable in the first mobile viewport"
                assert source.bounding_box()["height"] >= 44
                assert mp.evaluate("document.documentElement.scrollWidth <= innerWidth")
                mp.screenshot(path=str(OUT / f"product-workflow-mobile-{width}.png"))
                mp.get_by_role("navigation", name="公告详情栏目", exact=True).get_by_role("link", name="版本历史", exact=True).click()
                mp.get_by_role("region", name="版本历史线", exact=True).get_by_role("link", name="查看 DEMO 1.0 版本公告", exact=True).click()
                expect(mp.get_by_role("region", name="历史版本提示", exact=True)).to_contain_text("DEMO 3.0")
                mp.get_by_role("region", name="历史版本提示", exact=True).get_by_role("link", name="查看当前版本公告", exact=True).click()
                expect(mp.get_by_role("heading", name=latest["title"], exact=True)).to_be_visible()
                navigate(mp, "我的关注")
                expect(mp.get_by_role("heading", name="先关注你正在使用的软件", exact=True)).to_be_visible()
                assert mp.evaluate("document.documentElement.scrollWidth <= innerWidth")
                mobile.close()
                checks.append({"task": f"{width}px手机", "outcome": "从首页搜索到当前公告，官方主按钮首屏可见且44px；通过历史回当前；手机导航和空关注入口可用"})

            blocked = browser.new_context(viewport={"width": 375, "height": 812}, locale="zh-CN")
            blocked.add_init_script("Storage.prototype.setItem = function(){ throw new DOMException('blocked','SecurityError'); };")
            bp = blocked.new_page()
            bp.goto(base)
            settle(bp)
            search_announcements(bp, alias)
            bp.get_by_role("link", name=latest["title"], exact=True).click()
            expect(bp.get_by_role("heading", name=latest["title"], exact=True)).to_be_visible()
            bp.get_by_role("button", name="关注 " + name, exact=True).click()
            expect(bp.get_by_role("status").filter(has_text="临时关注")).to_be_visible()
            expect(bp.get_by_role("button", name="取消关注 " + name, exact=True)).to_have_attribute("aria-pressed", "true")
            bp.get_by_role("link", name="查看我的关注", exact=True).click()
            expect(bp.get_by_role("link", name=latest["title"], exact=True)).to_be_visible()
            expect(bp.get_by_text(re.compile("当前清单仅在本次页面会话中保留"))).to_be_visible()
            bp.get_by_role("button", name="取消关注 " + name, exact=True).click()
            expect(bp.get_by_role("status").filter(has_text="临时取消关注")).to_be_visible()
            expect(bp.get_by_role("heading", name="先关注你正在使用的软件", exact=True)).to_be_visible()
            bp.screenshot(path=str(OUT / "product-workflow-storage-recovery.png"))
            blocked.close()
            checks.append({"task": "关注存储故障", "outcome": "写入被拒仍能在页面会话关注并进入清单；说明刷新后丢失；取消最后一项仍有反馈"})

            # Deliberate malformed input checks recovery, not navigation discovery.
            public.goto(base + "/go/not-a-link")
            expect(public.get_by_role("heading", name="官方入口暂时无法打开", exact=True)).to_be_visible()
            expect(public.locator('meta[name="robots"]')).to_have_attribute("content", "noindex, nofollow")
            public.get_by_role("link", name="查找其他软件", exact=True).click()
            expect(public.get_by_role("searchbox", name="搜索软件名称、别名或用途", exact=True)).to_be_visible()
            checks.append({"task": "官方入口故障恢复", "outcome": "失效链接展示noindex站内恢复页，可以继续查找软件"})
            assert not errors, errors
            visitor.close()
            succeeded = True
        except Exception as exc:
            failure = f"{type(exc).__name__}: {str(exc).split('Aria snapshot:')[0]}"
            try:
                page.screenshot(path=str(OUT / "product-workflow-failure.png"), full_page=True)
            except Exception:
                pass
            raise
        finally:
            if csrf:
                for update_id in reversed(created_updates):
                    response = admin.request.post(base + f"/api/v1/admin/updates/{update_id}/archive", headers={"X-CSRF-Token": csrf}, data={})
                    if not response.ok:
                        cleanup_errors.append(f"Archive {update_id}: HTTP {response.status}")
                if software:
                    response = admin.request.delete(base + "/api/v1/admin/software/" + software["id"], headers={"X-CSRF-Token": csrf})
                    if not response.ok:
                        cleanup_errors.append(f"Unpublish own software: HTTP {response.status}")
                response = admin.request.post(base + "/api/v1/admin/auth/logout", headers={"X-CSRF-Token": csrf})
                if not response.ok:
                    cleanup_errors.append(f"Logout own session: HTTP {response.status}")
            result = {"status": "passed" if succeeded and not cleanup_errors else "failed", "tasks": checks, "browser_errors": errors, "cleanup_errors": cleanup_errors, "test_software_slug": software["slug"] if software else None, "created_announcements": len(created_updates), "failure": failure}
            (OUT / "product-workflow-e2e.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
            print(json.dumps(result, ensure_ascii=False))
            admin.close()
            browser.close()
            if succeeded and cleanup_errors:
                raise AssertionError("Workflow passed but fixture cleanup failed")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
