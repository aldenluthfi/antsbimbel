#!/bin/sh
set -eu

# Ensure migrations directory is treated as a Python package even if missing in a bad checkout.
mkdir -p /app/scheduling/migrations
touch /app/scheduling/migrations/__init__.py

# Fail fast if scheduling migrations are not discoverable.
if python manage.py showmigrations scheduling | grep -q "(no migrations)"; then
  echo "ERROR: scheduling migrations are not discoverable."
  echo "Do not run makemigrations on server. Generate and commit migrations from source code."
  exit 1
fi

python manage.py migrate --noinput

exec "$@"
