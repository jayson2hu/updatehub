#!/bin/sh
set -eu

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

# Single API instance in this deployment. Migrations must succeed before serving traffic.
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*' --no-access-log
