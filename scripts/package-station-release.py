"""Package current reviewed source, including uncommitted work, without runtime data."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone
import zipfile

root = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, str(root / "scripts/audit-security-files.py")], cwd=root, check=True)
files = subprocess.check_output(["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], cwd=root).decode("utf-8").split("\0")
stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
output = root / "runtime/releases" / stamp
output.mkdir(parents=True, exist_ok=False)
archive = output / "station-source.zip"
manifest = {}
for relative in sorted(set(filter(None, files))):
    file = root / relative
    if not file.is_file():
        continue
    if file.is_symlink() or root not in file.resolve().parents:
        raise SystemExit("Refusing symlinks or paths outside the project")
    if any(part in {".git", "runtime", "artifacts", "node_modules", ".venv", "uploads", "backups"} or part.startswith(".station-") for part in file.relative_to(root).parts):
        continue
    if file.suffix.lower() in {".pem", ".key", ".db"} or (file.name.startswith(".env") and not file.name.endswith(".example")) or file.name == "project.private.config.json":
        raise SystemExit("Refusing a private environment, credential or database file in source selection")
    manifest[relative] = hashlib.sha256(file.read_bytes()).hexdigest()
with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED) as bundle:
    for relative in manifest:
        content = (root / relative).read_bytes()
        if hashlib.sha256(content).hexdigest() != manifest[relative]:
            raise SystemExit("Source changed while packaging; rerun after edits finish")
        bundle.writestr(relative, content)
    bundle.writestr("RELEASE-MANIFEST.json", json.dumps({"created_at_utc": stamp, "initial_content": "empty", "files": manifest}, ensure_ascii=False, indent=2))
with zipfile.ZipFile(archive) as bundle:
    assert bundle.testzip() is None
    for relative, expected in manifest.items():
        assert hashlib.sha256(bundle.read(relative)).hexdigest() == expected
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(output / "station-source.zip.sha256").write_text(digest + "  station-source.zip\n", encoding="utf-8")
report = {"status": "passed", "archive": str(archive.relative_to(root)), "sha256": digest, "source_files": len(manifest), "bytes": archive.stat().st_size, "initial_content": "empty", "scope": "Source archive verified; not a built image or deployment. No runtime database, uploads or credentials included."}
(root / "artifacts/acceptance-20261019/release-package.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=False))
