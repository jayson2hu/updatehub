"""Build both clients and test them against a disposable local API/database.

Does not read or write runtime/station.db or use administrator credentials.
Generated clients retain the normal development configuration after testing.
"""
import os
import secrets
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
root = Path(__file__).resolve().parents[1]
api_root = root / "apps" / "api"
python = api_root / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
if not python.exists():
    raise SystemExit("请先创建 apps/api/.venv 并安装后端依赖，见 docs/station-operations.md。")
node = shutil.which("node")
if not node:
    raise SystemExit("需要 Node.js 22 或以上版本。")
run = root / "runtime" / "mini-tests" / (time.strftime("%Y%m%d-%H%M%S-") + secrets.token_hex(3))
run.mkdir(parents=True, exist_ok=True)
with socket.socket() as connection:
    connection.bind(("127.0.0.1", 0))
    port = connection.getsockname()[1]
env = {**os.environ, "PYTHONIOENCODING": "utf-8", "DATABASE_URL": "sqlite:///" + (run / "test.db").as_posix(), "UPLOAD_DIR": str(run / "uploads"), "ENVIRONMENT": "development", "LEGACY_ENABLED": "false", "STATION_SIGNING_KEY": secrets.token_hex(32), "MINIAPP_TEST_API": f"http://127.0.0.1:{port}/api/v1"}
flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


def command(args, cwd=root):
    print("RUN " + " ".join(str(arg) for arg in args[:4]), flush=True)
    subprocess.run(args, cwd=cwd, env=env, check=True, creationflags=flags, stdout=sys.stdout, stderr=subprocess.STDOUT)


server = None
try:
    command([node, "--test", "--test-isolation=none", "tests/miniprogram-config.test.cjs"])
    command([node, "scripts/build-miniprograms.cjs"])
    command([str(python), "-m", "alembic", "upgrade", "head"], api_root)
    command([str(python), "-m", "app.cli", "seed-station"], api_root)
    with (run / "api.log").open("w", encoding="utf-8") as log:
        server = subprocess.Popen([str(python), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(port), "--no-access-log"], cwd=api_root, env=env, stdout=log, stderr=subprocess.STDOUT, creationflags=flags)
        for _ in range(100):
            if server.poll() is not None:
                raise RuntimeError(f"隔离 API 启动失败，请检查 {run / 'api.log'}")
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/ready", timeout=1) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(.15)
        else:
            raise RuntimeError("隔离 API 未能在 15 秒内就绪")
        command([node, "--test", "--test-isolation=none", "tests/miniprogram.test.cjs"])
    print(f"隔离测试完成；测试库与日志：{run.relative_to(root)}。日常数据与管理员账号未使用。")
finally:
    if server is not None:
        server.terminate()
        try:
            server.wait(timeout=8)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait(timeout=5)
