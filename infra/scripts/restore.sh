#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Usage: $0 <compose-file> <database-dump> <new-restore-database>" >&2
  echo "Creates a separate, new database; never overwrites an existing database." >&2
  exit 2
fi

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose_file="$(realpath "$1")"
dump_file="$(realpath "$2")"
target_db="$3"
[[ -f "$compose_file" && -s "$dump_file" ]] || { echo "Compose file or dump missing" >&2; exit 2; }
[[ "$target_db" =~ ^[a-z][a-z0-9_]{0,62}$ ]] || { echo "Use a lowercase PostgreSQL database name (letters, digits, underscores; max 63)" >&2; exit 2; }
dump_name="$(basename "$dump_file")"
[[ "$dump_name" =~ ^updatehub-db-([0-9]{8}T[0-9]{6}Z)\.dump$ ]] || { echo "Use a timestamped dump produced by backup.sh" >&2; exit 2; }
manifest="$(dirname "$dump_file")/updatehub-checksums-${BASH_REMATCH[1]}.sha256"
[[ -f "$manifest" ]] || { echo "The matching SHA-256 manifest is required" >&2; exit 2; }
expected="$(awk -v name="$dump_name" '$2 == name { print $1 }' "$manifest")"
[[ "$expected" =~ ^[a-f0-9]{64}$ ]] || { echo "Manifest must contain exactly one valid dump checksum" >&2; exit 2; }
actual="$(sha256sum "$dump_file" | cut -d ' ' -f 1)"
[[ "$expected" == "$actual" ]] || { echo "Dump checksum mismatch; no database was changed" >&2; exit 2; }
compose=(docker compose --project-directory "$project_root" --env-file "$project_root/.env" -f "$compose_file")
live_db="$("${compose[@]}" exec -T postgres printenv POSTGRES_DB | tr -d '\r\n')"
[[ "$target_db" != "$live_db" && "$target_db" != postgres && "$target_db" != template0 && "$target_db" != template1 ]] || { echo "Refusing to restore into a live or system database" >&2; exit 2; }

# createdb fails if the target exists. There is no --clean, dropdb, or in-place restore.
"${compose[@]}" exec -T postgres sh -eu -c 'createdb -U "$POSTGRES_USER" "$1"' sh "$target_db"
"${compose[@]}" exec -T postgres sh -eu -c 'pg_restore -U "$POSTGRES_USER" --no-owner --exit-on-error --dbname="$1"' sh "$target_db" < "$dump_file"
"${compose[@]}" exec -T postgres sh -eu -c 'psql -U "$POSTGRES_USER" --dbname="$1" --set=ON_ERROR_STOP=1 --command="DELETE FROM admin_session;"' sh "$target_db"
echo "Restored into isolated database: $target_db"
echo "Historical administrator sessions were revoked in the restored database."
echo "The live database is unchanged. Verify this database with a separate application instance."
