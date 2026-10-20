"""Read-only screenshots of the daily preview; suppress visit-stat writes."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--channel", default="msedge")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
output = root / "artifacts/acceptance-20261019/delivery-preview"
output.mkdir(parents=True, exist_ok=True)
report = {"status": "running", "base": "http://localhost:3011", "screenshots": [], "blocked_writes": 0}


def public_only(route):
    if route.request.method in {"GET", "HEAD"}:
        route.continue_()
    elif route.request.url.endswith("/station/events"):
        report["blocked_writes"] += 1
        route.fulfill(status=204)
    else:
        report["blocked_writes"] += 1
        route.abort()


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel=args.channel, headless=True)
        for width in [360, 390, 1440]:
            options = {"viewport": {"width": width, "height": 844 if width < 768 else 1000}, "locale": "zh-CN", "timezone_id": "Asia/Shanghai", "reduced_motion": "reduce"}
            if width < 768:
                options.update(user_agent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36", is_mobile=True, has_touch=True)
            context = browser.new_context(**options)
            context.route("**/api/v1/**", public_only)
            page = context.new_page()
            for path, name in [("/", "home"), ("/software/guangmu?platform=tv", "detail")]:
                response = page.goto(report["base"] + path, wait_until="networkidle")
                assert response and response.status == 200
                assert page.evaluate("document.scrollingElement.scrollWidth <= innerWidth")
                filename = f"{name}-{width}.png"
                page.screenshot(path=str(output / filename))
                report["screenshots"].append(filename)
            context.close()
        browser.close()
    report["status"] = "passed"
finally:
    (output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print("Preview screenshots:", len(report["screenshots"]))
