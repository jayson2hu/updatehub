#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <compose-file> <absolute-backup-directory>" >&2
  exit 2
fi

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose_file="$(realpath "$1")"
[[ -f "$compose_file" ]] || { echo "Compose file does not exist" >&2; exit 2; }
[[ "$2" == /* && "$2" != / ]] || { echo "Use a dedicated absolute backup directory" >&2; exit 2; }
mkdir -p -- "$2"
backup_dir="$(realpath "$2")"
[[ "$backup_dir" != / && "$backup_dir" != "$project_root" ]] || { echo "Unsafe backup directory" >&2; exit 2; }
exec 9>"$backup_dir/.updatehub-backup.lock"
flock -n 9 || { echo "A backup is already running in this directory" >&2; exit 1; }
compose=(docker compose --project-directory "$project_root" --env-file "$project_root/.env" -f "$compose_file")
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
db_backup="$backup_dir/updatehub-db-$stamp.sqlite3"
upload_backup="$backup_dir/updatehub-uploads-$stamp.tar.gz"
[[ ! -e "$db_backup" && ! -e "$upload_backup" ]] || { echo "Backup already exists for this timestamp" >&2; exit 1; }
trap 'rm -f -- "$db_backup.partial" "$upload_backup.partial"' EXIT

# SQLite online backup API: a consistent snapshot while the API keeps serving.
# Integrity is checked inside the container before any bytes leave it.
"${compose[@]}" exec -T api python - > "$db_backup.partial" <<'PY'
import contextlib, os, sqlite3, sys, tempfile
fd, path = tempfile.mkstemp(dir="/tmp", suffix=".sqlite3")
os.close(fd)
try:
    # mode=rw: a missing live database fails instead of silently creating an empty one.
    with contextlib.closing(sqlite3.connect("file:/data/station.db?mode=rw", uri=True, timeout=30)) as source, contextlib.closing(sqlite3.connect(path)) as target:
        source.backup(target)
        if target.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            sys.exit("Backup integrity check failed")
        # A self-contained single file: no -wal/-shm companions are needed to read it.
        target.execute("PRAGMA journal_mode=DELETE")
    with open(path, "rb") as snapshot:
        while chunk := snapshot.read(1 << 20):
            sys.stdout.buffer.write(chunk)
finally:
    os.unlink(path)
PY
"${compose[@]}" exec -T api tar -C /data/uploads -czf - . > "$upload_backup.partial"
[[ -s "$db_backup.partial" && -s "$upload_backup.partial" ]] || { echo "Backup produced an empty artifact" >&2; exit 1; }
mv -- "$db_backup.partial" "$db_backup"
mv -- "$upload_backup.partial" "$upload_backup"
(cd "$backup_dir" && sha256sum "$(basename "$db_backup")" "$(basename "$upload_backup")" > "updatehub-checksums-$stamp.sha256")

# A successful new backup is required before retention runs. Only our timestamped files qualify.
find "$backup_dir" -maxdepth 1 -type f \
  \( -name 'updatehub-db-????????T??????Z.sqlite3' -o -name 'updatehub-uploads-????????T??????Z.tar.gz' -o -name 'updatehub-checksums-????????T??????Z.sha256' \) \
  -mtime +13 -delete
echo "Database: $db_backup"
echo "Uploads:  $upload_backup"
echo "Retention: 14 days; keep an encrypted off-host copy separately."
