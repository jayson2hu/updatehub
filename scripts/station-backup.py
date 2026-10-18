"""Create a consistent local SQLite backup and matching uploaded-image archive.

Run with the station API stopped so uploaded files do not change mid-copy.
Does not remove or overwrite live data. Production PostgreSQL uses infra backups.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import shutil
import sqlite3


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, default=root / 'runtime' / 'station.db')
    parser.add_argument('--uploads', type=Path, default=root / 'runtime' / 'station-uploads')
    parser.add_argument('--output', type=Path, default=root / 'runtime' / 'station-backups')
    args = parser.parse_args()
    if not args.database.is_file():
        parser.error(f'Database not found: {args.database}')
    timestamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    target = args.output.resolve() / timestamp
    target.mkdir(parents=True, exist_ok=False)
    db_copy = target / 'station.db'
    with sqlite3.connect(args.database.resolve().as_uri() + '?mode=ro', uri=True) as source:
        with sqlite3.connect(db_copy) as backup:
            source.backup(backup)
            integrity = backup.execute('PRAGMA integrity_check').fetchone()[0]
            if integrity != 'ok':
                raise RuntimeError(f'Backup integrity check failed: {integrity}')
    if args.uploads.is_dir():
        shutil.copytree(args.uploads, target / 'station-uploads')
    manifest = {
        'created_at_utc': timestamp,
        'database': str(args.database.resolve()),
        'database_sha256': hashlib.sha256(db_copy.read_bytes()).hexdigest(),
        'integrity_check': 'ok',
        'uploaded_files': sum(1 for item in (target / 'station-uploads').rglob('*') if item.is_file()),
    }
    (target / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    archive = shutil.make_archive(str(target), 'zip', root_dir=target)
    print(f'Backup complete: {archive}')
    print('Keep backups off the application server. Restrict access: the database includes administrator password hashes.')


if __name__ == '__main__':
    main()
