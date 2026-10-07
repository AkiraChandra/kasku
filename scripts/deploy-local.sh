#!/bin/bash
set -e
cd "$(dirname "$0")/.."
echo "=== Kasku Deploy ==="

if [[ ! -f .env ]]; then
  echo "[1/5] Generating secrets..."
  cp .env.example .env
  PW=$(openssl rand -base64 32)
  AUTH=$(openssl rand -base64 32)
  HMAC=$(openssl rand -base64 32)
  SEEDPW=$(openssl rand -base64 16)
  sed -i "s|POSTGRES_PASSWORD=<generate>|$PW|" .env
  sed -i "s|AUTH_SECRET=<generate 32+ char random>|$AUTH|" .env
  sed -i "s|EVENT_HMAC_SECRET=<generate random>|$HMAC|" .env
  sed -i "s|SEED_OWNER_PASSWORD=<generate>|$SEEDPW|" .env
fi

echo "[2/5] Validating compose..."
docker compose config --quiet

echo "[3/5] Starting postgres..."
docker compose up -d postgres
sleep 10

echo "[4/5] Running migration..."
PW=$(grep POSTGRES_PASSWORD .env | cut -d= -f2)
DATABASE_URL="postgresql://kasku:${PW}@localhost:5432/kasku" docker compose exec -T postgres psql -U kasku -d kasku -c "SELECT 1" > /dev/null 2>&1 && echo "  DB ready"

echo "[5/5] Starting all services..."
docker compose up -d
sleep 10

echo "=== Health Check ==="
for i in 1 2 3 4 5; do
  RESP=$(curl -sf http://localhost/health 2>/dev/null) && {
    echo "API: $RESP"
    echo "=== Deploy OK ==="
    echo "Web: http://localhost"
    echo "API: http://localhost/api"
    exit 0
  }
  sleep 3
done
docker compose logs --tail=20
exit 1
