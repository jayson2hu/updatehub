"""v4 browser acceptance. Writes only to an explicitly isolated local preview.

Requires a final build forwarding to a disposable API/database, never daily data.
Outputs real screenshots, checks and a failure/blocker report; does not fabricate
screenshots when browser launch is denied by the host.
"""
import argparse
import io
import json
import os
import re
import secrets
import time
import traceback
import httpx
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright
from PIL import Image

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--base-url", default="http://localhost:3012")
parser.add_argument("--channel", default="msedge")
parser.add_argument("--isolated", action="store_true", help="Confirm the site uses a disposable database")
parser.add_argument("--credentials", type=Path, default=root / "runtime/station-admin.json")
parser.add_argument("--output", type=Path, default=root / "artifacts/acceptance-20261019/browser")
args = parser.parse_args()
base = args.base_url.rstrip("/")
parsed = urlparse(base)
if not args.isolated or parsed.hostname not in {"localhost", "127.0.0.1"} or parsed.port != 3012:
    parser.error("仅允许 --isolated 且 localhost/127.0.0.1:3012 的隔离验收服务；禁止指向日常库。")
args.output.mkdir(parents=True, exist_ok=True)
report = {"status": "running", "base": base, "started_at": datetime.now(timezone.utc).isoformat(), "checks": [], "screenshots": [], "console_errors": [], "pending": []}


def check(name, action):
    action()
    report["checks"].append({"name": name, "status": "passed"})
    print("PASS " + name, flush=True)


def goto(page, path):
    response = page.goto(base + path, wait_until="networkidle")
    assert response and response.status == 200, f"页面未正常加载：{path}"
    expect(page.locator(".sv-site, .admin-root").first).to_be_visible()


def snapshot(page, name, full_page=True):
    filename = name + ".png"
    page.screenshot(path=str(args.output / filename), full_page=full_page)
    report["screenshots"].append(filename)


def no_overflow(page):
    assert page.evaluate("document.scrollingElement.scrollWidth <= innerWidth"), "整页横向溢出"


def api(context, method, path, payload=None, token=None, expected=200):
    headers = {"Origin": base}
    if token:
        headers["X-CSRF-Token"] = token
    response = context.request.fetch(base + "/api/v1" + path, method=method, data=payload, headers=headers)
    assert response.status == expected, f"接口状态错误：{method} {path} ({response.status})"
    return response.json() if response.body() else None


browser = None
software = None
admin = None
token = None
fixture_announcements = []
fixture_promotions = []
redactions = []
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel=args.channel, headless=True)
        guest = browser.new_context(viewport={"width": 390, "height": 844}, locale="zh-CN", timezone_id="Asia/Shanghai", reduced_motion="reduce")
        admin = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="zh-CN", timezone_id="Asia/Shanghai", reduced_motion="reduce")
        page = guest.new_page()
        manager = admin.new_page()
        for current in [page, manager]:
            current.set_default_timeout(15000)
            current.on("pageerror", lambda error: report["console_errors"].append(str(error)))
        credentials = {"email": os.getenv("E2E_ADMIN_EMAIL"), "password": os.getenv("E2E_ADMIN_PASSWORD")}
        if not all(credentials.values()):
            credentials = json.loads(args.credentials.read_text(encoding="utf-8-sig"))
        goto(manager, "/admin/login")
        manager.get_by_label("邮箱", exact=True).fill(credentials["email"])
        manager.locator('input[name="password"]').fill(credentials["password"])
        manager.get_by_role("button", name="登录管理后台", exact=True).click()
        expect(manager.locator(".adm-sidebar")).to_be_visible()
        token = api(admin, "GET", "/admin/auth/me")["csrf_token"]
        report["checks"].append({"name": "管理员从登录页进入工作台", "status": "passed"})
        # A unique, non-demo fixture has safe test URLs. They are never navigated.
        slug = "browser-acceptance-" + secrets.token_hex(4)
        software_name = "浏览器验收播放器" + slug[-4:]
        # Exercise the real editor, upload, failed save, draft privacy and publish.
        goto(manager, "/admin/station/software/new")
        manager.get_by_label("软件名称", exact=True).fill(software_name)
        manager.get_by_label("常用别名", exact=True).fill("浏览器验收别名")
        manager.get_by_label("一句话用途", exact=True).fill("仅在隔离库使用的交互验收内容")
        manager.get_by_label("固定链接名称", exact=True).fill(slug)
        manager.get_by_label("安卓电视", exact=True).check()
        picture = io.BytesIO()
        Image.new("RGB", (120, 80), "#245bdd").save(picture, "PNG")
        manager.get_by_label("上传软件图标", exact=True).set_input_files({"name": "browser-upload.png", "mimeType": "image/png", "buffer": picture.getvalue()})
        expect(manager.get_by_alt_text("软件图标预览")).to_be_visible()
        save_route = "**/api/v1/admin/station/software"
        manager.route(save_route, lambda route: route.fulfill(status=503, content_type="application/json", body=json.dumps({"detail": "验收模拟：保存暂时失败，请重试。"})))
        manager.get_by_role("button", name="保存草稿", exact=True).click()
        expect(manager.locator(".sa-error[role=alert]")).to_be_visible()
        expect(manager.get_by_label("软件名称", exact=True)).to_have_value(software_name)
        manager.unroute(save_route)
        with manager.expect_response(lambda r: r.url.endswith("/admin/station/software") and r.request.method == "POST") as saved:
            manager.get_by_role("button", name="保存草稿", exact=True).click()
        assert saved.value.status == 201
        software = saved.value.json()
        assert guest.request.get(base + "/api/v1/station/software/" + slug).status == 404
        manager.get_by_role("button", name="预览", exact=True).click()
        expect(manager.get_by_role("dialog")).to_be_visible()
        manager.get_by_role("button", name="返回编辑", exact=True).click()
        manager.get_by_role("button", name="发布", exact=True).click()
        expect(manager.get_by_text("软件已发布，可以继续发布各设备的版本。", exact=True)).to_be_visible()
        software = api(guest, "GET", "/station/software/" + slug)["software"]
        assert guest.request.get(base + software["icon_url"]).status == 200
        manager.reload(wait_until="networkidle")
        goto(manager, "/admin/station/software/" + software["id"])
        expect(manager.get_by_alt_text("软件图标预览")).to_have_attribute("src", software["icon_url"])
        report["checks"].append({"name": "真实软件表单、图片上传、失败保留重试、草稿预览与发布", "status": "passed"})
        versions = []
        for platform, version in [("android", "1.0"), ("android", "2.0"), ("tv", "3.0")]:
            versions.append(api(admin, "POST", "/admin/station/releases", {"software_id": software["id"], "platform": platform, "version": version, "summary": "修复部分电视设备启动后黑屏的问题", "published": True, "install_notice": "安装前先备份配置", "links": [{"label": "验收官方入口", "url": f"https://downloads.example.test/{platform}/{version}", "kind": "official", "is_primary": True, "code": "QA42"}, {"label": "验收备用入口", "url": f"https://mirror.example.test/{platform}/{version}", "kind": "official"}]}, token, 201))
        path = f"/software/{slug}?platform=android"

        def responsive():
            for width in [360, 390, 768, 1440]:
                page.set_viewport_size({"width": width, "height": 844 if width < 768 else 1000})
                for route, label in [("/", "home"), ("/software", "library"), (path, "detail"), ("/announcements", "announcements"), ("/me", "me")]:
                    goto(page, route)
                    no_overflow(page)
                    if label in {"home", "detail"}:
                        snapshot(page, f"{label}-{width}")
                        snapshot(page, f"{label}-viewport-{width}", full_page=False)
                    if label == "home" and width in {360, 390}:
                        card = page.locator(".sv-release-card").first.bounding_box()
                        nav = page.locator(".sv-tabbar").bounding_box()
                        assert card and nav and card["y"] >= 0 and card["y"] + card["height"] <= nav["y"], "首屏未完整显示第一条更新"
                    if label == "detail" and width < 768:
                        fixed = page.locator(".sv-sticky-dl").bounding_box()
                        nav = page.locator(".sv-tabbar").bounding_box()
                        assert fixed and nav and fixed["y"] + fixed["height"] <= nav["y"] + 1, "固定获取栏遮挡导航"
                        assert fixed["height"] >= 44
        check("360/390/768/1440 排版、首屏和固定栏", responsive)

        def platform_and_versions():
            page.set_viewport_size({"width": 390, "height": 844})
            goto(page, path)
            group = page.get_by_role("group", name="选择设备", exact=True)
            group.get_by_role("button", name=re.compile("电视")).click()
            expect(page.locator("#sv-download a.sv-btn--primary")).to_have_attribute("href", "https://downloads.example.test/tv/3.0")
            expect(page).to_have_url(re.compile("platform=tv"))
            group.get_by_role("button", name=re.compile("安卓")).click()
            page.get_by_role("group", name="选择版本", exact=True).get_by_role("button", name=re.compile("1.0")).click()
            expect(page.locator("#sv-download a.sv-btn--primary")).to_have_attribute("href", "https://downloads.example.test/android/1.0")
            page.reload(wait_until="networkidle")
            expect(page.locator("#sv-download a.sv-btn--primary")).to_have_attribute("href", "https://downloads.example.test/android/1.0")
            expect(page.locator(".sv-backup__url a")).to_have_attribute("href", "https://mirror.example.test/android/1.0")
            expect(page.get_by_text("安装前先备份配置", exact=False).first).to_be_visible()
        check("设备和历史版本独立链接、直接刷新、备用官方入口", platform_and_versions)

        def clipboard_failure():
            page.evaluate("Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{writeText:()=>Promise.reject(new Error('denied'))}}); document.execCommand=()=>false")
            page.get_by_role("button", name="复制获取链接", exact=True).click()
            expect(page.get_by_role("dialog", name="请手动复制")).to_be_visible()
            expect(page.get_by_label("要复制的内容")).to_have_value("https://downloads.example.test/android/1.0")
            page.keyboard.press("Tab")
            assert page.get_by_role("dialog", name="请手动复制").evaluate("el => el.contains(document.activeElement)"), "焦点离开弹层"
            page.keyboard.press("Escape")
            expect(page.get_by_role("dialog")).to_have_count(0)
        check("剪贴板拒绝、手动复制、弹层焦点和 Escape", clipboard_failure)

        def search():
            goto(page, "/search?q=浏览器验收别名")
            expect(page.get_by_role("link", name=re.compile("浏览器验收播放器")).first).to_be_visible()
            goto(page, "/search?q=完全不存在的验收名称")
            expect(page.get_by_text(re.compile("没找到|没有找到")).first).to_be_visible()
        check("别名搜索和无结果恢复入口", search)

        def chinese_search():
            page.set_viewport_size({"width": 1440, "height": 1000})
            goto(page, "/")
            field = page.get_by_role("searchbox", name="搜索软件", exact=True)
            field.focus()
            field.dispatch_event("compositionstart", {"data": ""})
            field.evaluate("el => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'wang');el.dispatchEvent(new InputEvent('input',{bubbles:true,data:'wang',isComposing:true}))}")
            page.wait_for_timeout(400)
            assert urlparse(page.url).path == "/", "拼音候选确认前发生导航"
            field.evaluate("el => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'网盘');el.dispatchEvent(new InputEvent('input',{bubbles:true,data:'网盘',isComposing:true}))}")
            field.dispatch_event("compositionend", {"data": "网盘"})
            target = page.get_by_role("searchbox", name="搜软件名、用途或公告", exact=True)
            expect(target).to_have_value("网盘")
            expect(target).to_be_focused()
            assert target.evaluate("el => el.selectionStart === el.value.length"), "搜索交接后光标未在末尾"
        check("中文输入法确认后交接搜索与焦点", chinese_search)

        def device_detection():
            dual = next(s for s in api(guest, "GET", "/station/data")["software"] if "android" in s["platforms"] and "ios" in s["platforms"])
            agents = [("Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36", "安卓"), ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1", "苹果")]
            for agent, label in agents:
                context = browser.new_context(viewport={"width": 390, "height": 844}, user_agent=agent, is_mobile=True, has_touch=True)
                try:
                    tab = context.new_page()
                    goto(tab, "/software/" + dual["slug"])
                    expect(tab.get_by_role("group", name="选择设备", exact=True).get_by_role("button", name=re.compile(label))).to_have_attribute("aria-pressed", "true")
                finally:
                    context.close()
        check("安卓与苹果浏览器设备预选（UA 模拟）", device_detection)

        def missing_pages():
            page.set_viewport_size({"width": 390, "height": 844})
            for route in ["/software/" + slug + "-missing", "/announcements/" + slug + "-missing", "/missing-" + slug]:
                page.goto(base + route, wait_until="networkidle")
                expect(page.get_by_role("heading", name="这个页面不存在", exact=True)).to_be_visible()
                expect(page.get_by_role("link", name="回首页", exact=True)).to_have_attribute("href", "/")
                no_overflow(page)
            snapshot(page, "not-found-390", full_page=False)
        check("不存在的软件、公告与路由实际恢复页面", missing_pages)

        def inapp_hints():
            original = api(admin, "GET", "/admin/station/data")["settings"]
            contexts = []
            try:
                api(admin, "PATCH", "/admin/station/settings", {"inapp_hint": True, "wechat_inapp_hint": False}, token)
                for agent, visible in [("MicroMessenger/8.0 Android", False), ("Xiaohongshu/9.0 Android", True)]:
                    context = browser.new_context(viewport={"width": 390, "height": 844}, user_agent=agent)
                    contexts.append(context)
                    tab = context.new_page()
                    goto(tab, path)
                    expect(tab.locator(".sv-inapp")).to_have_count(1 if visible else 0)
                    if visible:
                        tab.locator("#sv-download a.sv-btn--primary").click()
                        expect(tab.get_by_role("dialog", name="请在浏览器中打开后下载")).to_be_visible()
                api(admin, "PATCH", "/admin/station/settings", {"wechat_inapp_hint": True}, token)
                wechat = contexts[0].pages[0]
                wechat.reload(wait_until="networkidle")
                expect(wechat.locator(".sv-inapp")).to_be_visible()
                wechat.locator("#sv-download a.sv-btn--primary").click()
                expect(wechat.get_by_role("dialog", name="请在浏览器中打开后下载")).to_be_visible()
            finally:
                api(admin, "PATCH", "/admin/station/settings", {"inapp_hint": original["inapp_hint"], "wechat_inapp_hint": original["wechat_inapp_hint"]}, token)
                for context in contexts:
                    context.close()
        check("小红书默认引导、微信独立开关与下载引导", inapp_hints)

        def admin_publish():
            goto(manager, "/admin")
            manager.locator(".adm-publish").click()
            dialog = manager.get_by_role("dialog", name="发布软件更新")
            expect(dialog).to_be_visible()
            dialog.get_by_label("选择软件", exact=True).select_option(software["id"])
            dialog.get_by_label("新版本号", exact=True).fill("4.0-draft")
            dialog.get_by_label("一句话说明（最多 40 字）", exact=True).fill("隔离验收的快捷发布草稿")
            snapshot(manager, "admin-publish-1440")
            manager.set_viewport_size({"width": 1280, "height": 900})
            snapshot(manager, "admin-publish-1280", full_page=False)
            manager.set_viewport_size({"width": 1440, "height": 1000})
            dialog.get_by_role("button", name="存草稿", exact=True).click()
            expect(dialog.get_by_text("草稿已保存", exact=False).first).to_be_visible()
            public = api(guest, "GET", "/station/software/" + slug)
            assert all(r["version"] != "4.0-draft" for r in public["releases"]), "草稿公开泄漏"
            dialog.get_by_role("button", name="完成", exact=True).click()
            draft = next(r for r in api(admin, "GET", "/admin/station/data")["releases"] if r["software_id"] == software["id"] and r["version"] == "4.0-draft")
            goto(manager, "/admin/station/releases/" + draft["id"])
            manager.get_by_label("版本号", exact=True).fill("4.0")
            manager.get_by_label("获取链接 1", exact=True).fill("https://downloads.example.test/android/4.0")
            manager.get_by_role("button", name="预览", exact=True).click()
            expect(manager.get_by_role("dialog").get_by_text("https://downloads.example.test/android/4.0", exact=True)).to_be_visible()
            manager.get_by_role("button", name="返回编辑", exact=True).click()
            manager.get_by_role("button", name="发布", exact=True).click()
            expect(manager.get_by_text("更新已发布，首页和对应设备版本已同步。可以复制链接发到群里。", exact=True)).to_be_visible()
            goto(page, path + "&release=" + draft["id"])
            expect(page.locator("#sv-download a.sv-btn--primary")).to_have_attribute("href", "https://downloads.example.test/android/4.0")
            goto(page, "/")
            expect(page.locator(".sv-release-card").filter(has_text="浏览器验收播放器").filter(has_text="4.0").first).to_be_visible()
            goto(manager, "/admin")
            manager.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('denied'))}})")
            manager.locator(".adm-publish").click()
            dialog = manager.get_by_role("dialog", name="发布软件更新")
            dialog.get_by_label("选择软件", exact=True).select_option(software["id"])
            dialog.get_by_label("安卓电视", exact=True).check()
            dialog.get_by_label("新版本号", exact=True).fill("5.0")
            dialog.get_by_label("一句话说明（最多 40 字）", exact=True).fill("手机和电视同时更新，保留各自的获取入口。")
            for platform, label in [("android", "安卓手机"), ("tv", "安卓电视")]:
                dialog.get_by_label(f"官方下载链接（{label}）", exact=True).fill(f"https://downloads.example.test/{platform}/5.0")
            with manager.expect_response(lambda r: r.url.endswith("/admin/station/releases/batch") and r.request.method == "POST") as batch:
                dialog.get_by_role("button", name="发布并复制群通知", exact=True).click()
            assert batch.value.status == 201 and len(batch.value.json()) == 2
            expect(dialog.get_by_text("已发布。浏览器未允许自动复制，请全选下方群通知手动复制。", exact=True)).to_be_visible()
            notice_text = dialog.get_by_label("群通知预览", exact=True).input_value()
            assert "platform=android" in notice_text and "platform=tv" in notice_text
            snapshot(manager, "admin-publish-manual-copy-1440", full_page=False)
            dialog.get_by_role("button", name="完成", exact=True).click()
            current = [r for r in api(guest, "GET", "/station/software/" + slug)["releases"] if r["version"] == "5.0"]
            assert len(current) == 2 and all(r["links"][0]["url"] == f"https://downloads.example.test/{r['platform']}/5.0" for r in current)
            for width in [1280, 1440]:
                manager.set_viewport_size({"width": width, "height": 1000})
                no_overflow(manager)
            for route, label in [("/admin/station/software", "software"), ("/admin/station/releases", "releases"), ("/admin/station/announcements", "announcements")]:
                goto(manager, route)
                expect(manager.locator(".sa-table")).to_be_visible()
                no_overflow(manager)
                snapshot(manager, "admin-" + label + "-1440")
        check("v5 快捷草稿、完整编辑预览发布、前台同步与后台宽屏", admin_publish)

        def announcement_lifecycle():
            goto(manager, "/admin/station/announcements/new")
            title = "电视安装前先备份：浏览器验收公告"
            manager.get_by_label("公告标题", exact=True).fill(title)
            manager.get_by_label("简短摘要", exact=True).fill("请确认自己的设备，再查看对应安装步骤。")
            manager.get_by_label("公告正文", exact=True).fill("这是一条隔离环境验收公告。\n\n安装前，请先备份自己的配置。\n\n安卓手机和电视使用不同的安装文件，请在软件详情页选择正确设备。")
            manager.get_by_label("固定链接名称", exact=True).fill(slug + "-notice")
            manager.get_by_label("重要程度", exact=True).select_option("important")
            manager.get_by_label("置顶显示在首页", exact=True).check()
            manager.get_by_label(software_name, exact=True).check()
            manager.get_by_label("上传公告图片", exact=True).set_input_files({"name": "notice-upload.png", "mimeType": "image/png", "buffer": picture.getvalue()})
            expect(manager.locator("form").get_by_alt_text("公告图片 1", exact=True)).to_be_visible()
            with manager.expect_response(lambda r: r.url.endswith("/admin/station/announcements") and r.request.method == "POST") as saved:
                manager.get_by_role("button", name="保存草稿", exact=True).click()
            assert saved.value.status == 201
            notice = saved.value.json()
            fixture_announcements.append(notice["id"])
            assert guest.request.get(base + "/api/v1/station/announcements/" + notice["slug"]).status == 404
            manager.get_by_role("button", name="预览", exact=True).click()
            expect(manager.get_by_role("dialog").get_by_role("heading", name=title)).to_be_visible()
            manager.get_by_role("button", name="返回编辑", exact=True).click()
            manager.get_by_role("button", name="发布", exact=True).click()
            expect(manager.get_by_text("公告已发布，关联软件页面也会显示有效的重要提醒。", exact=True)).to_be_visible()
            goto(page, path)
            expect(page.get_by_role("link", name=re.compile(title)).first).to_be_visible()
            for width in [360, 390, 1440]:
                page.set_viewport_size({"width": width, "height": 844 if width < 768 else 1000})
                goto(page, "/announcements/" + notice["slug"])
                no_overflow(page)
                expect(page.locator("main img").first).to_be_visible()
                snapshot(page, f"announcement-{width}")
            manager.get_by_label("到期时间", exact=True).fill("2020-01-01T12:00")
            with manager.expect_response(lambda r: r.url.endswith("/admin/station/announcements/" + notice["id"]) and r.request.method == "PATCH") as expired_save:
                manager.get_by_role("button", name="保存修改", exact=True).click()
            assert expired_save.value.status == 200
            expect(manager.get_by_text("公告已发布，关联软件页面也会显示有效的重要提醒。", exact=True)).to_be_visible()
            page.reload(wait_until="networkidle")
            expect(page.get_by_text("已结束", exact=True).first).to_be_visible()
            ended = api(guest, "GET", "/station/announcements/" + notice["slug"])
            assert ended["expired"] and not ended["effective_pinned"]
            goto(page, path)
            # R-DETAIL-19 retains ended notices in related history, while
            # R-ANN-04 removes them from the home announcement area.
            related = page.get_by_role("link", name=re.compile(title))
            expect(related.get_by_text("已结束", exact=True)).to_be_visible()
            expect(related.get_by_text("置顶", exact=False)).to_have_count(0)
            goto(page, "/")
            expect(page.get_by_role("link", name=re.compile(title))).to_have_count(0)
            manager.get_by_role("button", name="撤回为草稿", exact=True).click()
            expect(manager.get_by_text("公告已保存为草稿，仅管理员可见。", exact=True)).to_be_visible()
            assert guest.request.get(base + "/api/v1/station/announcements/" + notice["slug"]).status == 404
            goto(page, path)
            expect(page.get_by_role("link", name=re.compile(title))).to_have_count(0)
        check("公告图文表单、草稿预览发布、关联、到期与撤回", announcement_lifecycle)

        def advertising():
            original = api(admin, "GET", "/admin/station/data")["settings"]
            contexts = []
            try:
                uploaded = admin.request.post(base + "/api/v1/admin/station/uploads", headers={"Origin": base, "X-CSRF-Token": token}, multipart={"file": {"name": "promotion.png", "mimeType": "image/png", "buffer": picture.getvalue()}})
                assert uploaded.status == 201
                cover_url = uploaded.json()["url"]
                promo = api(admin, "POST", "/admin/station/promotions", {"slug": slug + "-promo", "title": "隔离验收推广", "summary": "推广区域独立于获取入口", "body": "仅用于检验广告布局和容错。", "cover_url": cover_url, "target_url": "https://promo.example.test/activity", "published": True, "placements": ["home_feed", "detail_body", "desktop_sidebar"]}, token, 201)
                fixture_promotions.append(promo["id"])
                api(admin, "PATCH", "/admin/station/settings", {"ads_enabled": True, "ad_placements": {"home_feed": True, "detail_body": True, "desktop_sidebar": True}}, token)
                context = browser.new_context(viewport={"width": 390, "height": 844})
                contexts.append(context)
                tab = context.new_page()
                goto(tab, "/")
                slot = tab.locator('[data-placement="home_feed"]')
                slot.scroll_into_view_if_needed()
                expect(slot.get_by_text("广告", exact=True)).to_be_visible()
                expect(slot.locator("img")).to_be_visible()
                expect(slot.locator("img")).to_have_js_property("complete", True)
                assert slot.locator("img").evaluate("el => el.naturalWidth > 0"), "广告图片加载完成后没有有效图像"
                snapshot(tab, "advertisement-home-390")
                slot.get_by_role("button", name="关闭广告", exact=True).click()
                expect(slot).to_have_count(0)
                tab.reload(wait_until="networkidle")
                expect(slot).to_have_count(0)
                goto(tab, path)
                expect(tab.locator('[data-placement="detail_body"]')).to_have_count(1)
                expect(tab.locator("#sv-download a.sv-btn--primary")).to_have_attribute("href", "https://downloads.example.test/android/5.0")
                goto(tab, "/promo/" + promo["slug"])
                expect(tab.get_by_role("heading", name=promo["title"], exact=True)).to_be_visible()
                no_overflow(tab)
                snapshot(tab, "promotion-390")
                # Failed creative disappears while software and download remain usable.
                failed = browser.new_context(viewport={"width": 390, "height": 844})
                contexts.append(failed)
                failed.route("**" + cover_url, lambda route: route.abort())
                failed_tab = failed.new_page()
                with failed_tab.expect_request(lambda request: request.url.endswith(cover_url)):
                    goto(failed_tab, path)
                    failed_tab.evaluate("window.scrollTo(0, 800)")
                expect(failed_tab.locator('[data-placement="detail_body"]')).to_have_count(0)
                expect(failed_tab.locator("#sv-download a.sv-btn--primary")).to_have_attribute("href", "https://downloads.example.test/android/5.0")
                api(admin, "PATCH", "/admin/station/promotions/" + promo["id"], {"ends_at": (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()}, token)
                goto(tab, "/promo/" + promo["slug"])
                expect(tab.get_by_text(re.compile("已结束")).first).to_be_visible()
                assert tab.locator('a[href="https://promo.example.test/activity"]').count() == 0
            finally:
                api(admin, "PATCH", "/admin/station/settings", {"ads_enabled": original["ads_enabled"], "ad_placements": original["ad_placements"]}, token)
                for item in fixture_promotions:
                    api(admin, "PATCH", "/admin/station/promotions/" + item, {"published": False}, token)
                for context in contexts:
                    context.close()
        check("广告展示标记、会话关闭、图片失败隔离、推广直达和到期", advertising)

        def touch_targets():
            report["touch_targets"] = []
            for width in [360, 390]:
                page.set_viewport_size({"width": width, "height": 844})
                for route in ["/", "/software", "/search?q=网盘", path, "/me"]:
                    goto(page, route)
                    small = page.evaluate("""() => [...document.querySelectorAll('.sv-site button, .sv-site input:not([type=checkbox]), .sv-site select, .sv-tabbar a')].flatMap(el => {
                      const r = el.getBoundingClientRect();
                      if (!r.width || !r.height || el.disabled || el.getAttribute('aria-disabled') === 'true') return [];
                      let width = r.width, height = r.height;
                      for (const pseudo of ['::before', '::after']) {
                        const s = getComputedStyle(el, pseudo);
                        if (s.content === 'none' || s.content === 'normal' || s.position !== 'absolute' || s.pointerEvents === 'none') continue;
                        const n = v => Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0;
                        width = Math.max(width, r.width - n(s.left) - n(s.right));
                        height = Math.max(height, r.height - n(s.top) - n(s.bottom));
                      }
                      return width < 43.5 || height < 43.5 ? [{label: (el.getAttribute('aria-label') || el.textContent || el.placeholder || '').trim().slice(0,40), className:el.className, width, height}] : [];
                    })""")
                    report["touch_targets"].append({"width": width, "route": route, "undersized": small})
            assert not any(item["undersized"] for item in report["touch_targets"]), "存在小于 44px 的重要点击区，详见 touch_targets"
        check("360/390 重要控件点击区至少 44px（含伪元素扩展）", touch_targets)

        def text_contrast():
            page.set_viewport_size({"width": 1440, "height": 1000})
            goto(page, "/")
            report["text_contrast"] = page.evaluate("""() => {
              const root = getComputedStyle(document.querySelector('.sv-site'));
              const variable = name => root.getPropertyValue(name).trim();
              const rgb = color => color.startsWith('#') ? color.replace('#','').match(/.{2}/g).map(x=>parseInt(x,16)) : color.match(/[\\d.]+/g).slice(0,3).map(Number);
              const luminance = color => rgb(color).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
              const values = [['辅助文字/白底',variable('--sv-ink3'),'#FFFFFF'],['辅助文字/页面背景',variable('--sv-ink3'),variable('--sv-bg')],['输入提示/输入背景',variable('--sv-ink3'),variable('--sv-input-bg')]];
              for (const [name, selector] of [['首页统计','.sv-hero__stats span'],['首页公告','.sv-hero__side']]) {
                const el = document.querySelector(selector);
                if (el) { const css=getComputedStyle(el); values.push([name,css.color,css.backgroundColor]); }
              }
              return values.map(([label,foreground,background])=>{const a=luminance(foreground),b=luminance(background);return {label,foreground,background,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}});
            }""")
            assert all(row["ratio"] >= 4.5 for row in report["text_contrast"]), "必要辅助文字对比度低于 4.5:1"
        check("辅助文字、搜索提示与首页公告小字对比度至少 4.5:1", text_contrast)

        def feedback_and_sync():
            page.set_viewport_size({"width": 390, "height": 844})
            goto(page, path)
            ok = page.locator(".sv-fb").get_by_role("button", name=re.compile("能正常用"))
            issue = page.locator(".sv-fb").get_by_role("button", name=re.compile("有问题"))
            ok.click()
            expect(ok).to_have_attribute("aria-pressed", "true")
            issue.click()
            dialog = page.get_by_role("dialog", name="遇到了什么问题？")
            expect(dialog).to_be_visible()
            dialog.get_by_role("button", name="链接失效", exact=True).click()
            dialog.get_by_label("补充说明（选填）", exact=True).fill("隔离验收：用于核对补充说明不重复计票。")
            snapshot(page, "feedback-390", full_page=False)
            dialog.get_by_role("button", name="提交反馈", exact=True).click()
            expect(dialog).to_have_count(0)
            selected = next(r for r in api(guest, "GET", "/station/software/" + slug)["releases"] if r["platform"] == "android" and r["version"] == "5.0")
            assert selected["feedback_ok"] == 0 and selected["feedback_issue"] == 1
            issue.click()
            expect(issue).to_have_attribute("aria-pressed", "false")
            selected = next(r for r in api(guest, "GET", "/station/software/" + slug)["releases"] if r["id"] == selected["id"])
            assert selected["feedback_ok"] == 0 and selected["feedback_issue"] == 0
            # Verify successful copy without touching the user's OS clipboard.
            page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__qaCopied=text}}})")
            page.get_by_role("button", name="复制获取链接", exact=True).click()
            assert page.evaluate("window.__qaCopied") == "https://downloads.example.test/android/5.0"
            page.get_by_role("button", name="☆ 收藏", exact=True).click()
            goto(page, "/me")
            page.get_by_role("group", name="常用设备", exact=True).get_by_role("button", name=re.compile("电视")).click()
            with page.expect_response(lambda r: r.url.endswith("/station/sync-codes") and r.request.method == "POST") as generated:
                page.get_by_role("button", name="生成同步码", exact=True).click()
            assert generated.value.status == 201
            old_raw = generated.value.json()["code"]
            old = old_raw[:5] + "-" + old_raw[5:]
            redactions.extend([old, old_raw])
            expect(page.locator(".sv-bigcode")).to_have_text(old)
            with page.expect_response(lambda r: r.url.endswith("/station/sync-codes") and r.request.method == "POST") as regenerated:
                page.get_by_role("button", name="重新生成（旧码作废）", exact=True).click()
            assert regenerated.value.status == 201
            fresh = regenerated.value.json()["code"]
            redactions.extend([fresh, fresh[:5] + "-" + fresh[5:]])
            assert old.replace("-", "") != fresh, "重新生成未更换同步码"
            second = browser.new_context(viewport={"width": 390, "height": 844}, locale="zh-CN")
            try:
                restored = second.new_page()
                goto(restored, "/me")
                restored.get_by_role("button", name="输入同步码", exact=True).click()
                field = restored.get_by_label("在另一台设备上生成的同步码", exact=True)
                field.fill(old)
                restored.get_by_role("button", name="恢复收藏", exact=True).click()
                expect(restored.get_by_role("dialog").get_by_role("alert")).to_be_visible()
                field.fill(fresh)
                restored.get_by_role("button", name="恢复收藏", exact=True).click()
                expect(restored.get_by_role("dialog")).to_have_count(0)
                expect(restored.get_by_role("link", name=re.compile(software_name)).first).to_be_visible()
                expect(restored.get_by_role("group", name="常用设备", exact=True).get_by_role("button", name=re.compile("电视"))).to_have_attribute("aria-pressed", "true")
                restored.reload(wait_until="networkidle")
                expect(restored.get_by_role("link", name=re.compile(software_name)).first).to_be_visible()
                goto(restored, "/software/" + slug)
                expect(restored.get_by_role("group", name="选择设备", exact=True).get_by_role("button", name=re.compile("电视"))).to_have_attribute("aria-pressed", "true")
                goto(restored, path)
                expect(restored.get_by_role("group", name="选择设备", exact=True).get_by_role("button", name=re.compile("安卓"))).to_have_attribute("aria-pressed", "true")
            finally:
                second.close()
        check("匿名反馈改投补充撤销、复制成功、跨浏览器收藏恢复与旧码失效", feedback_and_sync)

        def slow_network():
            slow = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, locale="zh-CN")
            tab = slow.new_page()
            tab.add_init_script("window.__qa={lcp:0,cls:0};new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__qa.lcp=e.startTime)).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput)window.__qa.cls+=e.value})).observe({type:'layout-shift',buffered:true})")
            cdp = slow.new_cdp_session(tab)
            cdp.send("Network.enable")
            cdp.send("Network.setCacheDisabled", {"cacheDisabled": True})
            cdp.send("Network.emulateNetworkConditions", {"offline": False, "latency": 150, "downloadThroughput": 200000, "uploadThroughput": 93750})
            report["slow_4g"] = []
            for route in ["/", path]:
                goto(tab, route)
                tab.wait_for_timeout(800)
                values = tab.evaluate("window.__qa")
                report["slow_4g"].append({"path": route, **values})
                assert 0 < values["lcp"] <= 2500, f"LCP 不达标：{route}"
                assert values["cls"] <= .1, f"CLS 不达标：{route}"
            slow.close()
        check("慢 4G LCP ≤ 2.5s、CLS ≤ 0.1", slow_network)
        assert not report["console_errors"], "浏览器存在运行错误"
        browser.close()
        browser = None
        report["status"] = "passed"
except Exception as error:
    message = str(error)
    report["failure_type"] = type(error).__name__
    report["failure_frames"] = [{"file": Path(frame.filename).name, "line": frame.lineno, "function": frame.name} for frame in traceback.extract_tb(error.__traceback__)]
    for value in sorted(redactions, key=len, reverse=True):
        message = message.replace(value, "[已隐藏同步码]")
    denied = isinstance(error, PermissionError) or any(term in message for term in ["EPERM", "WinError 5", "Access is denied", "拒绝访问"])
    report["status"] = "blocked" if denied else "failed"
    report["reason"] = "环境拒绝启动浏览器自动化进程，未产生截图或浏览器通过证据。" if denied else (message or type(error).__name__)[:1600]
    report["pending"] = ["修复本次失败并复跑后续检查"] if report["checks"] else ["360/390/768/1440 实际页面截图", "后台 1280/1440 排版", "焦点、复制失败及固定栏", "慢 4G LCP/CLS"]
    print(report["reason"], flush=True)
finally:
    # A failed UI assertion still retracts this run's unique records. Use HTTP
    # after Playwright exits so cleanup also works when its context has closed.
    if software:
        cleanup_step = "login"
        try:
            with httpx.Client(base_url=base, headers={"Origin": base}, timeout=20, trust_env=False) as cleanup:
                login = cleanup.post("/api/v1/admin/auth/login", json=credentials)
                login.raise_for_status()
                cleanup.headers["X-CSRF-Token"] = login.json()["csrf_token"]
                for kind, ids in [("software", [software["id"]]), ("announcements", fixture_announcements), ("promotions", fixture_promotions)]:
                    cleanup_step = "retract " + kind
                    for item in ids:
                        cleanup.patch(f"/api/v1/admin/station/{kind}/{item}", json={"published": False}).raise_for_status()
                cleanup.post("/api/v1/admin/auth/logout")
            report["fixture_cleanup"] = "passed"
        except Exception as error:
            report["fixture_cleanup"] = {"status": "failed", "step": cleanup_step, "error_type": type(error).__name__, "http_status": getattr(getattr(error, "response", None), "status_code", None)}
            report["status"] = "failed"
    report["completed_at"] = datetime.now(timezone.utc).isoformat()
    (args.output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    history = args.output / "attempts"
    history.mkdir(exist_ok=True)
    (history / (report["started_at"].replace(":", "-") + ".json")).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
if report["status"] != "passed":
    raise SystemExit(2 if report["status"] == "blocked" else 1)
