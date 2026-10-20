"""Real HTTP acceptance on the explicitly isolated 8012 service.

Run --phase create, then --phase prepare-restart, restart that API with the
same database/uploads, then run --phase restart. Repeat preparation before
each additional real restart. Credentials and receipts are never printed.
"""
import argparse
import hashlib
import io
import json
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from PIL import Image

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--phase", choices=["create", "prepare-restart", "restart"], required=True)
args = parser.parse_args()
folder = root / "runtime" / "acceptance-20261019"
folder.mkdir(parents=True, exist_ok=True)
state_path = folder / "http-state.json"
credentials = json.loads((root / "runtime" / "station-admin.json").read_text(encoding="utf-8-sig"))
client = httpx.Client(base_url="http://127.0.0.1:8012", headers={"Origin": "http://localhost:3012"}, timeout=15)
public = "/api/v1/station"
admin = "/api/v1/admin/station"


def send(method, url, payload=None, expected=200, **kwargs):
    response = client.request(method, url, json=payload, **kwargs)
    assert response.status_code == expected, f"{method} {url}: expected {expected}, got {response.status_code}"
    return response.json() if response.content else None


assert client.get("/ready").status_code == 200
login = send("POST", "/api/v1/admin/auth/login", {"email": credentials["email"], "password": credentials["password"]})
client.headers["X-CSRF-Token"] = login["csrf_token"]
checks = []
if args.phase == "create":
    slug = "acceptance-" + secrets.token_hex(4)
    image = io.BytesIO()
    Image.new("RGB", (120, 80), "#245bdd").save(image, "PNG")
    uploaded = client.post(admin + "/uploads", files={"file": ("acceptance.png", image.getvalue(), "image/png")})
    assert uploaded.status_code == 201
    image_url = uploaded.json()["url"]
    software = send("POST", admin + "/software", {"slug": slug, "name": "验收专用播放器", "summary": "隔离库中的操作验收内容", "platforms": ["android", "tv"], "aliases": ["验收软件"], "icon_url": image_url, "installation": ["备份配置", "按提示安装"], "install_guides": {"tv": ["复制文件到 U 盘", "打开电视文件管理器安装"]}, "install_illustrations": {"tv": {"1": image_url}}, "pricing": "免费", "published": False}, 201)
    draft = send("POST", admin + "/releases", {"software_id": software["id"], "platform": "android", "version": "draft", "summary": "未发布的测试版本", "published": False}, 201)
    assert client.get(public + "/software/" + slug).status_code == 404
    assert all(s["id"] != software["id"] for s in send("GET", public + "/data")["software"])
    send("PATCH", admin + "/software/" + software["id"], {"published": True})
    old = send("POST", admin + "/releases", {"software_id": software["id"], "platform": "android", "version": "1.0", "summary": "兼容旧设备的稳定版", "published": True, "published_at": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(), "links": [{"label": "旧版测试来源", "url": "https://downloads.example.test/android/1.0", "code": "1234"}]}, 201)
    releases = send("POST", admin + "/releases/batch", {"releases": [{"software_id": software["id"], "platform": p, "version": "2.0", "summary": "修复电视启动后黑屏的问题", "published": True, "links": [{"label": "隔离验收来源", "url": f"https://downloads.example.test/{p}/2.0"}]} for p in ["android", "tv"]]}, 201)
    detail = send("GET", public + "/software/" + slug)
    assert len(detail["releases"]) == 3 and draft["id"] not in {r["id"] for r in detail["releases"]}
    for release in releases:
        assert next(r for r in detail["releases"] if r["id"] == release["id"])["links"][0]["url"].endswith(f"/{release['platform']}/2.0")
    held = send("POST", admin + "/releases", {"software_id": software["id"], "platform": "android", "version": "3.0", "summary": "先保留稳定版，等待适配", "advice": "hold", "stable_release_id": old["id"], "published": True}, 201)
    assert client.patch(admin + "/releases/" + old["id"], json={"published": False}).status_code == 422
    checks += ["software create/draft/publish", "draft releases private", "multi-platform independent links", "multiple downloadable versions", "stable release withdrawal protection"]
    announcement = send("POST", admin + "/announcements", {"slug": slug + "-notice", "title": "电视安装前先备份", "summary": "隔离库中的置顶提醒", "body": "先备份配置。\n\n按安装步骤操作。", "pinned": True, "importance": "important", "published": True, "expires_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(), "software_ids": [software["id"]], "images": [image_url]}, 201)
    assert any(a["id"] == announcement["id"] for a in send("GET", public + "/software/" + slug)["announcements"])
    send("PATCH", admin + "/announcements/" + announcement["id"], {"expires_at": (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()})
    ended = send("GET", public + "/announcements/" + announcement["slug"])
    assert ended["expired"] and not ended["effective_pinned"]
    send("PATCH", admin + "/announcements/" + announcement["id"], {"published": False})
    assert client.get(public + "/announcements/" + announcement["slug"]).status_code == 404
    assert httpx.get("http://127.0.0.1:8012" + admin + "/data").status_code == 401
    assert client.patch(admin + "/settings", json={"site_name": "不应保存"}, headers={"X-CSRF-Token": "wrong"}).status_code == 403
    checks += ["announcement pin/association/expiry/withdrawal", "anonymous admin denied", "CSRF denied"]
    vote = send("POST", public + "/feedback/vote", {"release_id": held["id"], "verdict": "issue", "channel": "web"})
    sync = send("POST", public + "/sync-codes", {"software_ids": [software["id"]], "device": "tv"}, 201)
    state = {"slug": slug, "software_id": software["id"], "release_id": held["id"], "receipt": vote["receipt"], "sync_code": sync["code"], "image": image_url, "image_sha256": hashlib.sha256(client.get(image_url).content).hexdigest()}
    state_path.write_text(json.dumps(state), encoding="utf-8")
elif args.phase == "prepare-restart":
    state = json.loads(state_path.read_text(encoding="utf-8"))
    # Roll a fresh receipt before stopping the process. A prior successful
    # restart consumed the previous receipt; don't mistake its expected 409
    # for an application failure or weaken the actual restart assertions.
    prior = state["receipt"]
    response = client.post(public + "/feedback/vote", json={"release_id": state["release_id"], "verdict": "issue", "receipt": prior})
    assert response.status_code in {200, 409}, "无法准备重启凭据，请先检查隔离反馈接口"
    vote = response.json() if response.status_code == 200 else send("POST", public + "/feedback/vote", {"release_id": state["release_id"], "verdict": "issue"})
    state.update({"receipt": vote["receipt"], "spent_receipt": prior, "issue_baseline": vote["issues"] - 1, "restart_consumed": False})
    state_path.write_text(json.dumps(state), encoding="utf-8")
    checks += ["fresh receipt and already-spent receipt prepared before process stop"]
else:
    state = json.loads(state_path.read_text(encoding="utf-8"))
    assert not state.get("restart_consumed"), "上轮凭据已消费；请先运行 --phase prepare-restart，再实际重启 API。"
    detail = send("GET", public + "/software/" + state["slug"])
    assert detail["software"]["id"] == state["software_id"] and len(detail["releases"]) == 4
    image = client.get(state["image"])
    assert image.status_code == 200 and hashlib.sha256(image.content).hexdigest() == state["image_sha256"]
    sync = send("GET", public + "/sync-codes/" + state["sync_code"])
    assert sync["software_ids"] == [state["software_id"]] and sync["device"] == "tv"
    if state.get("spent_receipt"):
        assert client.post(public + "/feedback/vote", json={"release_id": state["release_id"], "verdict": "none", "receipt": state["spent_receipt"]}).status_code == 409
    cancelled = send("POST", public + "/feedback/vote", {"release_id": state["release_id"], "verdict": "none", "receipt": state["receipt"]})
    assert cancelled["issues"] == state.get("issue_baseline", 0)
    assert client.post(public + "/feedback/vote", json={"release_id": state["release_id"], "verdict": "none", "receipt": state["receipt"]}).status_code == 409
    checks += ["database retained after process restart", "uploaded image bytes retained", "sync code restored after restart", "signing key retained", "spent receipt replay denied after restart"]
    state["restart_consumed"] = True
    state_path.write_text(json.dumps(state), encoding="utf-8")

report = {"phase": args.phase, "checks": checks, "passed": len(checks), "database": "isolated acceptance database", "run_at_utc": datetime.now(timezone.utc).isoformat()}
out = root / "artifacts" / "acceptance-20261019" / ("http-" + args.phase + ".json")
out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
client.close()
