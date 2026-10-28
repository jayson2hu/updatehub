#!/usr/bin/env bash
# CI-only acceptance for the actual production image, volume and backup wrappers.
set -euo pipefail
[[ "${CI:-}" == true && "${COMPOSE_PROJECT_NAME:-}" == updatehub-ci ]] || { echo "Run only in disposable CI with COMPOSE_PROJECT_NAME=updatehub-ci" >&2; exit 2; }
compose=(docker compose -f docker-compose.prod.yml)
backup_dir="$(mktemp -d /tmp/updatehub-ci-backup.XXXXXX)"
restore_dir="$backup_dir-restore"
"${compose[@]}" up -d --wait --wait-timeout 180 api web
"${compose[@]}" exec -T api python -m app.cli seed-station
"${compose[@]}" exec -T api python -m app.cli create-admin
"${compose[@]}" exec -T api python -c 'from pathlib import Path; from PIL import Image; Image.new("RGB", (16, 16), "teal").save(Path("/data/uploads/restore-ci.png"))'
"${compose[@]}" exec -T api python -c 'import urllib.request; assert urllib.request.urlopen("http://127.0.0.1:8000/ready").status == 200'
"${compose[@]}" exec -T web node -e 'fetch("http://127.0.0.1:3000").then(r => {if (!r.ok) process.exit(1)}).catch(() => process.exit(1))'
bash infra/scripts/backup.sh docker-compose.prod.yml "$backup_dir"
dump_file="$(find "$backup_dir" -maxdepth 1 -name 'updatehub-db-*.sqlite3' -print -quit)"
upload_file="$(find "$backup_dir" -maxdepth 1 -name 'updatehub-uploads-*.tar.gz' -print -quit)"
manifest_file="$(find "$backup_dir" -maxdepth 1 -name 'updatehub-checksums-*.sha256' -print -quit)"
(cd "$backup_dir" && sha256sum -c "$(basename "$manifest_file")")
bash infra/scripts/restore.sh docker-compose.prod.yml "$dump_file" "$restore_dir"
if bash infra/scripts/restore.sh docker-compose.prod.yml "$dump_file" "$restore_dir"; then
  echo "ERROR: overwriting an existing restore directory should have been rejected" >&2; exit 1
fi
"${compose[@]}" run --rm --no-deps -T --user "$(id -u):$(id -g)" -v "$restore_dir:/restore:ro" --entrypoint python api -c 'import sqlite3; db=sqlite3.connect("file:/restore/station.db?mode=ro", uri=True); assert db.execute("SELECT count(*) FROM station_software").fetchone()[0] >= 6; assert db.execute("SELECT count(*) FROM admin_session").fetchone()[0] == 0'
# Recover images into a separate temporary directory; the online upload volume stays unchanged.
"${compose[@]}" exec -T api python -c 'import sys, tarfile; from pathlib import Path; out=Path("/tmp/restore-ci"); out.mkdir(); archive=tarfile.open(fileobj=sys.stdin.buffer, mode="r|gz"); archive.extractall(out, filter="data"); assert (out/"restore-ci.png").read_bytes() == Path("/data/uploads/restore-ci.png").read_bytes()' < "$upload_file"
"${compose[@]}" run --rm --no-deps -T --user "$(id -u):$(id -g)" -v "$restore_dir:/restore" -e "DATABASE_URL=sqlite:////restore/station.db" -e "UPLOAD_DIR=/tmp/restore-uploads" --entrypoint python api -c 'from fastapi.testclient import TestClient; from app.main import app; client=TestClient(app); assert client.get("/ready").status_code == 200; data=client.get("/api/v1/station/data").json(); assert len(data["software"]) >= 6 and len(data["releases"]) >= 8; assert client.get("/api/v1/station/software/guangmu").status_code == 200; assert client.get("/api/v1/software").status_code == 410'
echo "CONTAINER_BACKUP_RESTORE_PASSED"
