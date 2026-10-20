"""Read-only production-page, asset and redirect checks (not visual QA)."""
import argparse
import gzip
import json
import re
import time
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--base", default="http://127.0.0.1:3011")
args = parser.parse_args()
base = args.base.rstrip("/")
folder = root / "artifacts" / "acceptance-20261019"
folder.mkdir(parents=True, exist_ok=True)


def get(path):
    start = time.perf_counter()
    request = urllib.request.Request(base + path, headers={"Accept-Encoding": "gzip"})
    try:
        response = urllib.request.urlopen(request, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        raw = response.read()
        compressed = response.headers.get("Content-Encoding") == "gzip"
        data = gzip.decompress(raw) if compressed else raw
        return data, len(raw) if compressed else len(gzip.compress(data)), response.code, round((time.perf_counter() - start) * 1000, 1)


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = set()
        self.nomodule = set()

    def handle_starttag(self, tag, attributes):
        values = dict(attributes)
        if tag == "script" and values.get("src", "").startswith("/"):
            self.urls.add(values["src"])
            if "nomodule" in values:
                self.nomodule.add(values["src"])
        if tag == "link" and values.get("rel") == "stylesheet" and values.get("href", "").startswith("/"):
            self.urls.add(values["href"])


report = []
for path in ["/", "/software", "/search", "/me", "/announcements", "/software/guangmu?platform=tv", "/admin/login", "/admin/station/releases/new", "/missing-acceptance-page"]:
    body, size, status, elapsed = get(path)
    page = Assets()
    html = body.decode("utf-8")
    page.feed(html)
    # Flight imports use relative chunk names rather than script tags. These
    # modules are required for hydration and must count toward the JS budget.
    page.urls.update("/_next/" + value for value in re.findall(r'static/chunks/[^"<>\\\s]+?\.js', html))
    assets = []
    for url in sorted(page.urls):
        _, asset_size, asset_status, _ = get(url)
        assets.append({"url": url, "gzip_bytes": asset_size, "status": asset_status, "nomodule_only": url in page.nomodule})
    row = {"path": path, "status": status, "html_gzip_bytes": size, "html_css_js_gzip_bytes": size + sum(a["gzip_bytes"] for a in assets if not a["nomodule_only"]), "legacy_nomodule_extra_bytes": sum(a["gzip_bytes"] for a in assets if a["nomodule_only"]), "measurement": "modern mobile browser; includes all Flight hydration imports; excludes nomodule-only fallback", "server_ms": elapsed, "assets": assets}
    if path in {"/", "/software/guangmu?platform=tv"}:
        row["transfer_budget_200kib"] = row["html_css_js_gzip_bytes"] <= 200 * 1024
    assert all(a["status"] == 200 for a in assets), f"资源未正常返回：{path}"
    assert status == (404 if path == "/missing-acceptance-page" else 200), f"页面状态不正确：{path} ({status})"
    report.append(row)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


opener = urllib.request.build_opener(NoRedirect)
for path, status, target in [("/designs/a/software/guangmu", 308, "/"), ("/finder", 308, "/search"), ("/my-software", 308, "/me"), ("/updates", 308, "/"), ("/admin/software", 308, "/admin"), ("/api/v1/software", 410, None)]:
    try:
        response = opener.open(base + path, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    location = response.headers.get("Location")
    report.append({"path": path, "status": response.code, "location": location})
    assert response.code == status, f"旧路由状态不正确：{path} ({response.code})"
    assert not target or location and location.endswith(target), f"旧路由去向不正确：{path} ({location})"

(folder / "http-pages.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
for row in report:
    print({key: value for key, value in row.items() if key != "assets"})
assert all(row.get("transfer_budget_200kib", True) for row in report), "首页或详情的首屏 HTML/CSS/JS gzip 超过 200KiB；详见 http-pages.json"
