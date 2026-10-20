"""Read-only source secret scan. Report names/locations only, never matched values."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

root = Path(__file__).resolve().parents[1]
output = root / "artifacts/acceptance-20261019/source-security.json"
files = subprocess.check_output(["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], cwd=root).decode("utf-8").split("\0")
rules = {
    "private_key": rb"-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----",
    "aws_access_key": rb"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b",
    "github_token": rb"\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b",
    "slack_token": rb"\bxox[baprs]-[0-9]{8,}-[A-Za-z0-9-]{15,}\b",
}
local_secrets = []
credential_file = root / "runtime/station-admin.json"
if credential_file.exists():
    password = json.loads(credential_file.read_text(encoding="utf-8-sig")).get("password", "")
    if len(password) >= 12:
        local_secrets.append(password.encode())
key_file = root / "runtime/station-signing.key"
if key_file.exists() and len(key_file.read_bytes().strip()) >= 32:
    local_secrets.append(key_file.read_bytes().strip())
findings, scanned, fingerprints = [], 0, {}
for relative in sorted(set(filter(None, files))):
    file = root / relative
    if not file.is_file():
        continue
    data = file.read_bytes()
    scanned += 1
    fingerprints[relative] = hashlib.sha256(data).hexdigest()
    if (file.name == ".env" or file.name.startswith(".env.")) and not file.name.endswith(".example"):
        findings.append({"file": relative, "rule": "non_example_environment_file"})
    for rule, pattern in rules.items():
        for match in re.finditer(pattern, data):
            findings.append({"file": relative, "line": data[:match.start()].count(b"\n") + 1, "rule": rule})
    for secret in local_secrets:
        if secret in data:
            findings.append({"file": relative, "rule": "local_runtime_secret_in_source"})
report = {"status": "passed" if not findings else "review_required", "files_scanned": scanned, "findings": findings, "scope": "当前跟踪与未忽略源码；常见凭据模式及本地管理员/签名密钥精确匹配；不含 Git 历史或任意秘密的完整识别", "source_manifest_sha256": hashlib.sha256(json.dumps(fingerprints, sort_keys=True).encode()).hexdigest()}
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=False))
raise SystemExit(1 if findings else 0)
