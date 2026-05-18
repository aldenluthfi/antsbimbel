#!/bin/bash
set -e

echo "==> Pulling latest code from git..."
git pull

echo "==> Building and starting containers (volumes preserved)..."
docker compose build --pull
docker compose up -d

echo "==> Running pending migrations..."
docker compose exec backend python manage.py migrate --noinput

echo "==> Collecting static files..."
docker compose exec backend python manage.py collectstatic --noinput

echo ""
echo "==> Done! Containers are up to date."
docker compose ps