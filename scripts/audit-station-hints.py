"""Verify host-specific guide HTML with real persisted settings on isolated 3012.

This is HTTP/SSR evidence only, not a browser click or visibility check.
The previous two settings are restored even when a check fails.
"""
import argparse
import http.cookiejar
import json
import os
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--isolated", action="store_true", help="Confirm 3012 uses a disposable database")
args = parser.parse_args()
if not args.isolated:
    parser.error("必须加 --isolated，且 3012 必须连接隔离验收库。")
base = "http://localhost:3012"
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
token = None


def request(path, method="GET", data=None, agent=None):
    headers = {"Origin": base}
    if token:
        headers["X-CSRF-Token"] = token
    if agent:
        headers["User-Agent"] = agent
    if data is not None:
        headers["Content-Type"] = "application/json"
    body = json.dumps(data).encode() if data is not None else None
    with opener.open(urllib.request.Request(base + path, data=body, method=method, headers=headers), timeout=15) as response:
        value = response.read()
        return json.loads(value) if "application/json" in response.headers.get("Content-Type", "") else value.decode()


class Hints(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.count = 0
        self.feed(html)

    def handle_starttag(self, tag, attributes):
        if "sv-inapp" in dict(attributes).get("class", "").split():
            self.count += 1


credentials = {"email": os.getenv("E2E_ADMIN_EMAIL"), "password": os.getenv("E2E_ADMIN_PASSWORD")}
if not all(credentials.values()):
    credentials = json.loads((root / "runtime/station-admin.json").read_text(encoding="utf-8-sig"))
token = request("/api/v1/admin/auth/login", "POST", credentials)["csrf_token"]
original = request("/api/v1/admin/station/data")["settings"]
path = "/software/guangmu?platform=android"
checks = []
try:
    for xhs, wechat in [(True, False), (True, True), (False, True), (False, False)]:
        values = {"inapp_hint": xhs, "wechat_inapp_hint": wechat}
        saved = request("/api/v1/admin/station/settings", "PATCH", values)
        assert all(saved[key] == value for key, value in values.items())
        for label, agent, expected in [("wechat", "Android MicroMessenger/8.0", wechat), ("xhs", "Android Xiaohongshu/9.0", xhs)]:
            for route in ["/", path]:
                count = Hints(request(route, agent=agent)).count
                assert count == int(expected), f"{label} 的提示条与独立开关不一致"
            checks.append({"xhs_enabled": xhs, "wechat_enabled": wechat, "host": label, "home_and_detail_html": "passed"})
finally:
    restored = request("/api/v1/admin/station/settings", "PATCH", {"inapp_hint": original["inapp_hint"], "wechat_inapp_hint": original["wechat_inapp_hint"]})
    assert restored["inapp_hint"] == original["inapp_hint"] and restored["wechat_inapp_hint"] == original["wechat_inapp_hint"]
    request("/api/v1/admin/auth/logout", "POST")
result = {"passed": True, "kind": "isolated persisted configuration and server-rendered HTML; not browser interaction", "checks": checks, "original_settings_restored": True}
output = root / "artifacts/acceptance-20261019/http-hints.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(result, ensure_ascii=False))
