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
db_backup="$backup_dir/updatehub-db-$stamp.dump"
upload_backup="$backup_dir/updatehub-uploads-$stamp.tar.gz"
[[ ! -e "$db_backup" && ! -e "$upload_backup" ]] || { echo "Backup already exists for this timestamp" >&2; exit 1; }
trap 'rm -f -- "$db_backup.partial" "$upload_backup.partial"' EXIT

"${compose[@]}" exec -T postgres sh -eu -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$db_backup.partial"
"${compose[@]}" exec -T api tar -C /data/uploads -czf - . > "$upload_backup.partial"
[[ -s "$db_backup.partial" && -s "$upload_backup.partial" ]] || { echo "Backup produced an empty artifact" >&2; exit 1; }
mv -- "$db_backup.partial" "$db_backup"
mv -- "$upload_backup.partial" "$upload_backup"
(cd "$backup_dir" && sha256sum "$(basename "$db_backup")" "$(basename "$upload_backup")" > "updatehub-checksums-$stamp.sha256")

# A successful new backup is required before retention runs. Only our timestamped files qualify.
find "$backup_dir" -maxdepth 1 -type f \
  \( -name 'updatehub-db-????????T??????Z.dump' -o -name 'updatehub-uploads-????????T??????Z.tar.gz' -o -name 'updatehub-checksums-????????T??????Z.sha256' \) \
  -mtime +13 -delete
echo "Database: $db_backup"
echo "Uploads:  $upload_backup"
echo "Retention: 14 days; keep an encrypted off-host copy separately."
