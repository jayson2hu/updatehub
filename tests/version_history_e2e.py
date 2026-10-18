"""Version-history browser acceptance against running local test services.

Creates one uniquely named demo software record and six demo releases, then
archives only those announcements and unpublishes only that software in finally.
Never starts/restarts services or edits pre-existing seeded records.
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


def release_day(item):
    return item["official_release_date"] or datetime.fromisoformat(item["published_at"].replace("Z", "+00:00")).astimezone(timezone.utc).date().isoformat()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=os.getenv("E2E_BASE_URL", "http://localhost:3000"))
    parser.add_argument("--credentials", type=Path, default=ROOT / "runtime/local-admin.json")
    parser.add_argument("--browser", default=os.getenv("E2E_BROWSER_PATH"))
    args = parser.parse_args()
    base = args.base_url.rstrip("/")
    if urlsplit(base).hostname not in {"localhost", "127.0.0.1", "::1"}:
        parser.error("Run this fixture-creating test only against a local test service.")
    email, password = os.getenv("E2E_ADMIN_EMAIL"), os.getenv("E2E_ADMIN_PASSWORD")
    if not (email and password):
        credentials = json.loads(args.credentials.read_text(encoding="utf-8-sig"))
        email, password = credentials["email"], credentials["password"]
    launch = {"headless": True}
    if args.browser:
        launch["executable_path"] = str(Path(args.browser).resolve())
    elif EDGE.is_file():
        launch["executable_path"] = str(EDGE)
    OUT.mkdir(exist_ok=True)
    token = uuid.uuid4().hex[:10]
    software_slug = f"e2e-history-{token}"
    checks, errors, created_updates, cleanup_errors = [], [], [], []
    software_id, succeeded, failure = None, False, None

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(**launch)
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="zh-CN", timezone_id="Asia/Shanghai")
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        csrf = None

        def read(path):
            response = context.request.get(base + "/api/v1" + path)
            assert response.ok, f"Read {path} returned {response.status}"
            return response.json()

        def mutate(path, method, payload=None):
            response = context.request.fetch(base + "/api/v1" + path, method=method, data=payload, headers={"X-CSRF-Token": csrf})
            assert response.ok, f"{method} {path} returned {response.status}"
            return response.json()

        def go(target, active_page=page):
            response = active_page.goto(base + target)
            active_page.wait_for_load_state("networkidle")
            return response

        def history(active_page=page):
            section = active_page.locator("#version-history")
            expect(section).to_be_visible()
            expect(section.get_by_role("heading", name="版本历史线", exact=True)).to_be_visible()
            return section

        def ids(section):
            return section.locator(".release-timeline-item").evaluate_all("items => items.map(item => item.dataset.updateId)")

        def assert_history(section, expected):
            expect(section.locator(".release-timeline-item")).to_have_count(len(expected))
            assert ids(section) == [item["id"] for item in expected], "Rendered timeline order differs from history API"
            for item in expected:
                row = section.locator(f'.release-timeline-item[data-update-id="{item["id"]}"]')
                expect(row).to_have_attribute("data-version", item["version"])
                expect(row.locator("time").first).to_be_visible()
                assert row.locator("time").first.get_attribute("datetime"), "Timeline date lacks semantic datetime"
                expect(row).to_contain_text(re.compile("推荐|可选|按需|暂缓|尽快|建议"))
                if item["is_demo"]:
                    expect(row).to_contain_text("演示")
                if row.get_attribute("aria-current") == "true":
                    expect(row.locator('a[href="#announcement-start"]')).to_be_visible()
                else:
                    expect(row.get_by_role("link", name=f"查看 {item['version']} 版本公告", exact=True)).to_be_visible()

        def current_row(section):
            return section.locator('.release-timeline-item[aria-current="true"], .release-timeline-item.is-viewing')

        try:
            seeded = read("/software/vscode/history?page=1&page_size=100")
            assert seeded["total"] >= 4, "Seed at least four published VS Code release examples before running"
            seeded_dates = [release_day(item) for item in seeded["items"]]
            assert seeded_dates == sorted(seeded_dates, reverse=True)
            assert all(item["kind"] == "release" and item["status"] == "published" and item["software"]["slug"] == "vscode" for item in seeded["items"])
            seeded_first = read("/software/vscode/history?page=1&page_size=5")
            go("/software/vscode")
            assert_history(history(), seeded_first["items"])
            checks.append("VS Code software record exposes at least four published releases in effective-date order")

            login = context.request.post(base + "/api/v1/admin/auth/login", data={"email": email, "password": password})
            assert login.ok, f"Test administrator login returned {login.status}"
            csrf = login.json()["csrf_token"]
            software = mutate("/admin/software", "POST", {"name": f"E2E 版本历史演示 {token}", "slug": software_slug, "summary": "仅用于版本历史浏览器验收，测试后下线。", "description": "受控的演示资料，不对应真实软件或官方版本。", "published": True, "is_demo": True, "latest_version": "DEMO INITIAL", "platforms": ["windows"], "official_links": [{"label": "演示官方来源", "url": "https://example.com/history-test", "type": "website", "is_primary": True, "is_active": True}]})
            software_id = software["id"]
            go("/software/" + software_slug)
            empty = history()
            expect(empty.locator(".release-timeline-item")).to_have_count(0)
            expect(empty).to_contain_text(re.compile("暂无|尚无|还没有|暂未"))
            assert read(f"/software/{software_slug}/history")["total"] == 0
            checks.append("A software record without release announcements shows a truthful empty timeline")

            releases = {}
            for number in (6, 2, 5, 1, 4, 3):
                record = mutate("/admin/updates", "POST", {"slug": f"{software_slug}-v{number}", "title": f"E2E 历史版本演示 {number} · {token}", "summary": "用于验证历史顺序和分页，不代表真实版本。", "content": "演示公告。测试后归档，请勿用于实际软件操作。", "kind": "release", "software_id": software_id, "version": f"DEMO HISTORY {number}", "previous_version": f"DEMO HISTORY {number - 1}", "update_level": "recommended", "reason_to_update": "演示内容无需执行操作。", "who_should_update": "仅限本地浏览器验收。", "official_release_date": f"2020-01-{number:02d}", "official_release_url": "https://example.com/history-test", "is_demo": True, "is_pinned": number == 1})
                created_updates.append(record["id"])
                releases[number] = mutate(f"/admin/updates/{record['id']}/publish", "POST", {"confirmed": True})
            notice = mutate("/admin/updates", "POST", {"slug": f"{software_slug}-notice", "title": f"E2E 使用提醒演示 {token}", "summary": "提醒不应出现在版本历史中。", "content": "这是一条演示使用提醒，不是版本发布。", "kind": "notice", "software_id": software_id, "reason_to_update": "无需操作。", "who_should_update": "浏览器验收。", "is_demo": True})
            created_updates.append(notice["id"])
            mutate(f"/admin/updates/{notice['id']}/publish", "POST", {"confirmed": True})
            full_history = read(f"/software/{software_slug}/history?page=1&page_size=100")
            assert full_history["total"] == 6
            assert [item["id"] for item in full_history["items"]] == [releases[number]["id"] for number in (6, 5, 4, 3, 2, 1)]
            assert read(f"/software/{software_slug}")["latest_version"] == "DEMO HISTORY 6"
            go("/update/" + releases[6]["slug"])
            first_page = read(f"/software/{software_slug}/history?page=1&page_size=5")
            section = history()
            assert_history(section, first_page["items"])
            expect(current_row(section)).to_have_count(1)
            expect(current_row(section)).to_have_attribute("data-update-id", releases[6]["id"])
            section.screenshot(path=str(OUT / "version-history-desktop.png"))
            checks.append("History ignores pin/publication order, excludes non-release notices and displays dates, advice and demo labels")

            section.locator(f'a[href="/update/{releases[3]["slug"]}"]').first.click()
            page.wait_for_load_state("networkidle")
            expect(page).to_have_url(re.compile(r"/update/" + re.escape(releases[3]["slug"]) + r"(?:[?#].*)?$"))
            expect(page.get_by_role("heading", name=releases[3]["title"], exact=True)).to_be_visible()
            section = history()
            expect(current_row(section)).to_have_count(1)
            expect(current_row(section)).to_have_attribute("data-update-id", releases[3]["id"])
            current_version = section.locator(".version-history-context > span").filter(has_text="档案当前记录")
            expect(current_version).to_contain_text("DEMO HISTORY 6")
            expect(section.locator(".version-history-context > span").filter(has_text="正在阅读")).to_contain_text("DEMO HISTORY 3")
            expect(section.locator(f'.release-timeline-item[data-update-id="{releases[6]["id"]}"] .history-recorded-label')).to_have_text("档案当前版本")
            expect(current_row(section)).to_have_attribute("data-version", "DEMO HISTORY 3")
            checks.append("Clicking an older announcement marks the reading version separately from the software's current recorded version")

            next_link = section.locator('a[href*="history_page=2"]').first
            expect(next_link).to_have_attribute("href", re.compile(r"history_page=2.*#version-history$"))
            next_link.click()
            page.wait_for_load_state("networkidle")
            expect(page).to_have_url(re.compile(r"history_page=2#version-history$"))
            second = history()
            assert_history(second, read(f"/software/{software_slug}/history?page=2&page_size=5")["items"])
            expect(second.locator('a[href*="history_page=1"]').first).to_be_visible()
            checks.append("Announcement history uses real second-page data with an anchored return to the timeline")

            go("/software/" + software_slug + "?history_page=2#version-history")
            assert_history(history(), [releases[1]])
            expect(current_row(history())).to_have_count(0)
            go("/software/" + software_slug + "?history_page=999#version-history")
            assert history().locator(".release-timeline-item").count() > 0
            go("/update/" + releases[3]["slug"] + "?history_page=not-a-page#version-history")
            assert_history(history(), first_page["items"])
            checks.append("Software history has matching pagination and invalid history pages recover to usable content")

            for width in (375, 393):
                mobile = browser.new_context(viewport={"width": width, "height": 812}, is_mobile=True, has_touch=True, locale="zh-CN", timezone_id="Asia/Shanghai")
                mp = mobile.new_page()
                mp.on("pageerror", lambda error: errors.append(str(error)))
                go("/update/" + releases[3]["slug"] + "#version-history", mp)
                mobile_history = history(mp)
                assert_history(mobile_history, first_page["items"])
                expect(current_row(mobile_history)).to_have_attribute("data-update-id", releases[3]["id"])
                assert mp.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"Announcement overflow at {width}px"
                mobile_history.screenshot(path=str(OUT / f"version-history-mobile-{width}.png"))
                mobile_history.locator('a[href*="history_page=2"]').first.click()
                mp.wait_for_load_state("networkidle")
                assert_history(history(mp), [releases[1]])
                assert mp.evaluate("document.documentElement.scrollWidth <= innerWidth")
                go("/software/" + software_slug + "#version-history", mp)
                assert_history(history(mp), first_page["items"])
                assert mp.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"Software record overflow at {width}px"
                mobile.close()
                checks.append(f"{width}px mobile history can read, paginate and open software history without horizontal overflow")
            assert not errors, errors
            checks.append("No uncaught browser errors")
            succeeded = True
        except Exception as exc:
            failure = f"{type(exc).__name__}: {exc}"
            page.screenshot(path=str(OUT / "version-history-failure.png"), full_page=True)
            raise
        finally:
            for update_id in reversed(created_updates):
                try:
                    mutate(f"/admin/updates/{update_id}/archive", "POST")
                except Exception as exc:
                    cleanup_errors.append(f"Could not archive test announcement {update_id}: {type(exc).__name__}")
            if software_id:
                try:
                    mutate(f"/admin/software/{software_id}", "DELETE")
                except Exception as exc:
                    cleanup_errors.append(f"Could not unpublish test software {software_id}: {type(exc).__name__}")
            if csrf:
                try:
                    mutate("/admin/auth/logout", "POST")
                except Exception as exc:
                    cleanup_errors.append(f"Could not revoke test session: {type(exc).__name__}")
            result = {"status": "passed" if succeeded and not cleanup_errors else "failed", "passed": len(checks), "checks": checks, "browser_errors": errors, "cleanup_errors": cleanup_errors, "test_software_slug": software_slug if software_id else None, "test_updates_created": len(created_updates), "failure": failure}
            (OUT / "version-history-e2e.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
            print(json.dumps(result, ensure_ascii=False))
            context.close()
            browser.close()
            if succeeded and cleanup_errors:
                raise AssertionError("Test cleanup did not finish; inspect version-history-e2e.json")


if __name__ == "__main__":
    main()
