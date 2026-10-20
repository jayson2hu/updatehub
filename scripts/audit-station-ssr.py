"""Read-only v4 HTML contracts against the isolated HTTP fixture (not browser QA)."""
import json
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlencode, urlsplit

root = Path(__file__).resolve().parents[1]
state = json.loads((root / "runtime/acceptance-20261019/http-state.json").read_text(encoding="utf-8"))
base = "http://127.0.0.1:3012"


def get(path):
    with urllib.request.urlopen(base + path, timeout=15) as response:
        return response.read().decode("utf-8")


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.anchors = []
        self.words = []
        self.script = False
        self.feed(html)

    def handle_starttag(self, tag, attributes):
        if tag == "script":
            self.script = True
        if tag == "a":
            self.anchors.append(dict(attributes))

    def handle_endtag(self, tag):
        if tag == "script":
            self.script = False

    def handle_data(self, value):
        if not self.script:
            self.words.append(value)


detail = json.loads(get("/api/v1/station/software/" + state["slug"]))
checks = []
for release in detail["releases"]:
    platform = release["platform"]
    current = next(r for r in detail["releases"] if r["platform"] == platform)
    target = next((r for r in detail["releases"] if r["id"] == release.get("stable_release_id")), release) if release == current and release["advice"] == "hold" else release
    links = [l for l in target["links"] if l.get("is_active", True) and l.get("kind", "official") == "official"]
    if not links:
        continue
    main = next((l for l in links if l.get("is_primary")), links[0])
    path = "/software/" + state["slug"] + "?" + urlencode({"platform": platform, "release": release["id"]})
    page = Page(get(path))
    buttons = [a for a in page.anchors if "sv-btn--primary" in a.get("class", "").split()]
    assert len(buttons) == 2 and all(a.get("href") == main["url"] for a in buttons), "正文与底部主按钮的设备/版本地址不一致"
    words = "".join(page.words)
    assert ("复制稳定版链接" if target != release else "复制获取链接") in words
    assert urlsplit(main["url"]).hostname in words
    if main.get("code"):
        assert main["code"] in words and "复制提取码" in words
    if release != current and current["advice"] == "hold":
        assert "有使用提醒，请先查看更新建议" in words
        assert "建议下载最新版" not in words
    checks.append({"platform": platform, "version": release["version"], "target_version": target["version"], "buttons_and_copy": "passed"})
assert len(checks) >= 3, "缺少可验证的多设备与历史版本样本"
data = json.loads(get("/api/v1/station/data"))
missing_link_demo = Page(get("/software/yunpan?platform=desktop"))
assert "查看稳定版 4.0.6" in "".join(missing_link_demo.words)
assert not any("sv-btn--primary" in a.get("class", "").split() for a in missing_link_demo.anchors), "示例缺少真实链接时不能显示可下载的主链接"
notices = 0
for notice in data["announcements"]:
    page = Page(get("/announcements/" + notice["slug"]))
    assert notice["title"] in "".join(page.words)
    if notice.get("expired"):
        assert "已结束" in "".join(page.words)
    notices += 1
try:
    missing = urllib.request.urlopen(base + "/software/not-a-public-software-acceptance", timeout=15)
except urllib.error.HTTPError as error:
    missing = error
with missing:
    missing_status = missing.code
    missing_html = missing.read().decode("utf-8")
# Next documents streamed notFound responses as 200 + noindex; non-streamed is
# 404. Both must render the recovery UI, never a real software/download page.
assert missing_status in {200, 404}
# The loading boundary streams first; Next serializes the recovery page for
# hydration. Do not call this evidence that the recovery UI was browser-tested.
assert "这个页面不存在" in missing_html and "NEXT_HTTP_ERROR_FALLBACK;404" in missing_html
assert 'name="robots" content="noindex"' in missing_html
report = {"passed": True, "kind": "HTTP server-rendered HTML; not a browser interaction test", "versions": checks, "missing_stable_link_uses_view_action": True, "direct_announcement_pages": notices, "missing_software_status": missing_status, "missing_software_noindex_and_404_boundary": True}
output = root / "artifacts/acceptance-20261019/http-ssr.json"
output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=False))
