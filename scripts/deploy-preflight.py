"""Read-only production configuration checks. Never prints configuration values."""
import argparse
import json
import os
import sys
from pathlib import Path
import re
import shutil
import stat
import subprocess
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]


def read_env(path):
    result = {}
    for number, raw in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ValueError(f"第 {number} 行需要 KEY=value")
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", key) or key in result:
            raise ValueError(f"第 {number} 行的配置名无效或重复")
        if value[:1] in {"'", '"'}:
            if len(value) < 2 or value[-1] != value[0]:
                raise ValueError(f"第 {number} 行的引号未闭合")
            value = value[1:-1]
        result[key] = value
    return result


def evaluate(values, bootstrap=False):
    checks = []

    def check(name, valid, action):
        checks.append({"name": name, "status": "passed" if valid else "failed", "action": "" if valid else action})

    domain = values.get("DOMAIN", "")
    domain_ok = bool(re.fullmatch(r"(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}", domain))
    domain_ok = domain_ok and not any(domain.lower() == suffix or domain.lower().endswith("." + suffix) for suffix in ["example.com", "example.org", "example.net", "test", "invalid", "localhost", "local"])
    check("DOMAIN", domain_ok, "填写已购买并指向服务器的实际域名；中文域名填写 Punycode")
    check("PUBLIC_SITE_URL", domain_ok and values.get("PUBLIC_SITE_URL") == "https://" + domain, "必须等于 https:// 加 DOMAIN，不带尾斜线、端口、路径或查询参数")
    check("ACME_EMAIL", bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", values.get("ACME_EMAIL", ""))), "填写可接收证书通知的邮箱")
    for key in ["POSTGRES_PASSWORD", "STATION_SIGNING_KEY"]:
        value = values.get(key, "")
        check(key, bool(re.fullmatch(r"[a-f0-9]{64}", value)) and len(set(value)) >= 8, "使用 secrets.token_hex(32) 独立生成，保存到受保护的密钥副本")
    check("independent_secrets", bool(values.get("POSTGRES_PASSWORD")) and values.get("POSTGRES_PASSWORD") != values.get("STATION_SIGNING_KEY"), "数据库密码与反馈签名密钥不能共用")
    for key in ["POSTGRES_DB", "POSTGRES_USER"]:
        check(key, bool(re.fullmatch(r"[a-z][a-z0-9_]{0,62}", values.get(key, "updatehub"))), "仅用小写字母、数字、下划线；以字母开头，最多 63 字符")
    check("LEGACY_ENABLED", values.get("LEGACY_ENABLED", "false").lower() == "false", "保持旧接口关闭")
    for index, value in enumerate(filter(None, (p.strip() for p in values.get("MINIAPP_REFERER_PREFIXES", "").split(",")))):
        try:
            parsed = urlsplit(value)
            _ = parsed.port
            valid = parsed.scheme == "https" and bool(parsed.hostname) and not (parsed.username or parsed.password or parsed.query or parsed.fragment) and parsed.path not in {"", "/"} and parsed.path.endswith("/") and not any(c.isspace() for c in value) and not any(c in value for c in "*\\?#")
        except ValueError:
            valid = False
        check(f"MINIAPP_REFERER_PREFIXES[{index}]", valid, "填精确到小程序 AppID 的 HTTPS 路径前缀并以 / 结尾；未接入时留空")
    if bootstrap:
        email = values.get("ADMIN_INITIAL_EMAIL", "")
        password = values.get("ADMIN_INITIAL_PASSWORD", "")
        check("ADMIN_INITIAL_EMAIL", bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email)) and email != "admin@update.local", "填写独立生产管理员邮箱")
        check("ADMIN_INITIAL_PASSWORD", len(password) >= 16 and not any(c in password for c in "$\r\n") and password not in {values.get("POSTGRES_PASSWORD"), values.get("STATION_SIGNING_KEY")}, "使用独立至少 16 位密码；不要包含 Compose 会插值的 $；初始化后删除")
    else:
        check("bootstrap_password_removed", not values.get("ADMIN_INITIAL_PASSWORD"), "初始化完成后清空 ADMIN_INITIAL_PASSWORD 并重新创建 API 容器；首次启动可用 --bootstrap")
    return checks


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    parser.add_argument("--bootstrap", action="store_true")
    parser.add_argument("--require-docker", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        values = read_env(args.env_file)
        checks = evaluate(values, args.bootstrap)
        names = set(values) | {"POSTGRES_DB", "POSTGRES_USER", "DOMAIN", "PUBLIC_SITE_URL", "POSTGRES_PASSWORD", "STATION_SIGNING_KEY", "MINIAPP_REFERER_PREFIXES", "ADMIN_INITIAL_EMAIL", "ADMIN_INITIAL_PASSWORD", "COMPOSE_PROJECT_NAME", "COMPOSE_FILE"}
        overrides = [name for name in names if name in os.environ and os.environ[name] != values.get(name, "")]
        checks.append({"name": "shell_environment_overrides", "status": "failed" if overrides else "passed", "action": "清除与配置文件冲突的同名环境变量后重试（包括 COMPOSE_PROJECT_NAME/COMPOSE_FILE）" if overrides else ""})
        if os.name != "nt":
            restricted = not (stat.S_IMODE(args.env_file.stat().st_mode) & 0o077)
            checks.append({"name": "env_file_permissions", "status": "passed" if restricted else "failed", "action": "" if restricted else "执行 chmod 600 配置文件"})
        if args.require_docker:
            docker = shutil.which("docker")
            okay = False
            if docker and all(c["status"] == "passed" for c in checks):
                # Prevent shell variables from overriding the validated env file. Do not display compose output.
                clean_env = {k: v for k, v in os.environ.items() if k not in values}
                commands = [[docker, "info", "--format", "{{.ServerVersion}}"], [docker, "compose", "--env-file", str(args.env_file.resolve()), "-f", str(ROOT / "docker-compose.prod.yml"), "config", "--quiet"]]
                okay = all(subprocess.run(command, cwd=ROOT, env=clean_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30).returncode == 0 for command in commands)
            checks.append({"name": "docker_and_compose", "status": "passed" if okay else "failed", "action": "" if okay else "在 Linux 部署机准备 Docker Engine/Compose v2、Docker 权限及正确配置后复跑"})
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        checks = [{"name": "configuration_read", "status": "failed", "action": "检查配置文件是否存在、格式及权限；检查过程未输出配置值", "error_type": type(exc).__name__}]
    report = {"status": "passed" if all(c["status"] == "passed" for c in checks) else "failed", "checks": checks, "scope": "只读配置检查；不验证 DNS、TLS、备案、镜像漏洞、数据迁移或正式上线"}
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
