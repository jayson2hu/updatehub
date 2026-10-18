#!/usr/bin/env bash
# CI-only acceptance for the actual production image, volume and backup wrappers.
set -euo pipefail
[[ "${CI:-}" == true && "${COMPOSE_PROJECT_NAME:-}" == updatehub-ci ]] || { echo "Run only in disposable CI with COMPOSE_PROJECT_NAME=updatehub-ci" >&2; exit 2; }
compose=(docker compose -f docker-compose.prod.yml)
backup_dir="$(mktemp -d /tmp/updatehub-ci-backup.XXXXXX)"
"${compose[@]}" up -d --wait --wait-timeout 180 postgres api web
"${compose[@]}" exec -T api python -m app.cli seed
"${compose[@]}" exec -T api python -m app.cli seed-content
"${compose[@]}" exec -T api python -m app.cli create-admin
"${compose[@]}" exec -T api python -c 'from pathlib import Path; from PIL import Image; Image.new("RGB", (16, 16), "teal").save(Path("/data/uploads/restore-ci.png"))'
"${compose[@]}" exec -T api python -c 'import urllib.request; assert urllib.request.urlopen("http://127.0.0.1:8000/ready").status == 200'
"${compose[@]}" exec -T web node -e 'fetch("http://127.0.0.1:3000").then(r => {if (!r.ok) process.exit(1)}).catch(() => process.exit(1))'
bash infra/scripts/backup.sh docker-compose.prod.yml "$backup_dir"
dump_file="$(find "$backup_dir" -maxdepth 1 -name 'updatehub-db-*.dump' -print -quit)"
upload_file="$(find "$backup_dir" -maxdepth 1 -name 'updatehub-uploads-*.tar.gz' -print -quit)"
manifest_file="$(find "$backup_dir" -maxdepth 1 -name 'updatehub-checksums-*.sha256' -print -quit)"
(cd "$backup_dir" && sha256sum -c "$(basename "$manifest_file")")
if bash infra/scripts/restore.sh docker-compose.prod.yml "$dump_file" "${POSTGRES_DB:-updatehub}"; then
  echo "ERROR: live database restore should have been rejected" >&2; exit 1
fi
bash infra/scripts/restore.sh docker-compose.prod.yml "$dump_file" updatehub_restore_ci
if bash infra/scripts/restore.sh docker-compose.prod.yml "$dump_file" updatehub_restore_ci; then
  echo "ERROR: overwriting an existing database should have been rejected" >&2; exit 1
fi
"${compose[@]}" exec -T postgres sh -eu -c 'test "$(psql -U "$POSTGRES_USER" -d updatehub_restore_ci -Atc "SELECT count(*) FROM software")" = 12; test "$(psql -U "$POSTGRES_USER" -d updatehub_restore_ci -Atc "SELECT count(*) FROM admin_session")" = 0'
# Recover images into a separate temporary directory; the online upload volume stays unchanged.
"${compose[@]}" exec -T api python -c 'import sys, tarfile; from pathlib import Path; out=Path("/tmp/restore-ci"); out.mkdir(); archive=tarfile.open(fileobj=sys.stdin.buffer, mode="r|gz"); archive.extractall(out, filter="data"); assert (out/"restore-ci.png").read_bytes() == Path("/data/uploads/restore-ci.png").read_bytes()' < "$upload_file"
"${compose[@]}" run --rm --no-deps --entrypoint python -e "DATABASE_URL=postgresql+psycopg://${POSTGRES_USER:-updatehub}:${POSTGRES_PASSWORD}@postgres:5432/updatehub_restore_ci" api -c 'from fastapi.testclient import TestClient; from app.main import app; client=TestClient(app); assert client.get("/ready").status_code == 200; assert client.get("/api/v1/software").json()["total"] == 12; assert client.get("/api/v1/software/vscode").status_code == 200'
echo "CONTAINER_BACKUP_RESTORE_PASSED"
