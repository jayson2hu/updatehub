#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# -ne 3 ]]; then
  echo "Usage: $0 <compose-file> <database-backup> <new-absolute-restore-directory>" >&2
  echo "Creates a separate, new SQLite file; never touches the live database volume." >&2
  exit 2
fi

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose_file="$(realpath "$1")"
backup_file="$(realpath "$2")"
[[ -f "$compose_file" && -s "$backup_file" ]] || { echo "Compose file or database backup missing" >&2; exit 2; }
[[ "$3" == /* && "$3" != / ]] || { echo "Use a new absolute restore directory" >&2; exit 2; }
[[ ! -e "$3" ]] || { echo "Restore directory already exists; refusing to overwrite" >&2; exit 2; }
backup_name="$(basename "$backup_file")"
[[ "$backup_name" =~ ^updatehub-db-([0-9]{8}T[0-9]{6}Z)\.sqlite3$ ]] || { echo "Use a timestamped database backup produced by backup.sh" >&2; exit 2; }
manifest="$(dirname "$backup_file")/updatehub-checksums-${BASH_REMATCH[1]}.sha256"
[[ -f "$manifest" ]] || { echo "The matching SHA-256 manifest is required" >&2; exit 2; }
expected="$(awk -v name="$backup_name" '$2 == name { print $1 }' "$manifest")"
[[ "$expected" =~ ^[a-f0-9]{64}$ ]] || { echo "Manifest must contain exactly one valid database checksum" >&2; exit 2; }
actual="$(sha256sum "$backup_file" | cut -d ' ' -f 1)"
[[ "$expected" == "$actual" ]] || { echo "Backup checksum mismatch; nothing was restored" >&2; exit 2; }

# mkdir without -p fails if another process created the directory meanwhile.
mkdir -- "$3"
restore_dir="$(realpath "$3")"
[[ "$restore_dir" != "$project_root" && "$restore_dir" != "$project_root"/* ]] || { rmdir -- "$restore_dir"; echo "Restore outside the source tree" >&2; exit 2; }
cp -- "$backup_file" "$restore_dir/station.db"
compose=(docker compose --project-directory "$project_root" --env-file "$project_root/.env" -f "$compose_file")

# The production image checks integrity and revokes historical sessions in the copy only.
"${compose[@]}" run --rm --no-deps -T --user "$(id -u):$(id -g)" -v "$restore_dir:/restore" --entrypoint python api - <<'PY'
import contextlib, sqlite3, sys
with contextlib.closing(sqlite3.connect("file:/restore/station.db?mode=rw", uri=True)) as db:
    if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
        sys.exit("Restored database failed the integrity check")
    db.execute("DELETE FROM admin_session")
    db.commit()
PY
echo "Restored into isolated file: $restore_dir/station.db"
echo "Historical administrator sessions were revoked in the restored copy."
echo "The live database is unchanged. Verify this copy with a separate application instance before any switch-over."
