#!/bin/bash
# Build happens on CI (GitHub Actions).
# VPS only: pull + migrate + restart.

set -e

echo "=== Kasku VPS Deploy ==="
echo "Pulling latest images..."
docker compose pull

echo "Running migrations..."
docker compose run --rm api node dist/migrate.js 2>/dev/null || true

echo "Restarting services..."
docker compose up -d --remove-orphans

echo "Waiting for api health..."
sleep 5

echo "=== Deploy complete ==="
