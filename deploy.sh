#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/ubuntu/apps/backend"

echo "[deploy] Starting DigifyHR backend deployment"

cd "$APP_DIR"

if [ ! -f "$APP_DIR/compose.yml" ]; then
    echo "[deploy] ERROR: compose.yml not found"
    exit 1
fi

if [ ! -f "$APP_DIR/.env" ]; then
    echo "[deploy] ERROR: .env not found"
    exit 1
fi

if [ ! -f "$APP_DIR/firebase-service-account.json" ]; then
    echo "[deploy] ERROR: firebase-service-account.json not found"
    exit 1
fi

chmod 600 "$APP_DIR/firebase-service-account.json"

echo "[deploy] Validating Docker Compose configuration..."
docker compose config >/dev/null

echo "[deploy] Building backend image..."
docker compose build

echo "[deploy] Starting backend through Docker Compose..."
docker compose up -d --force-recreate --remove-orphans

echo "[deploy] Waiting for backend startup..."
sleep 8

echo "[deploy] Container status:"
docker compose ps

echo "[deploy] Verifying Firebase environment..."
docker inspect digift-backend \
  --format='{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -q '^GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/firebase-service-account.json$'

echo "[deploy] Verifying Firebase credential mount..."
docker inspect digift-backend \
  --format='{{range .Mounts}}{{println .Destination}}{{end}}' \
  | grep -q '^/run/secrets/firebase-service-account.json$'

echo "[deploy] Verifying container is running..."
STATUS="$(docker inspect digift-backend --format='{{.State.Status}}')"

if [ "$STATUS" != "running" ]; then
    echo "[deploy] ERROR: backend container is not running"
    docker logs --tail 100 digift-backend || true
    exit 1
fi

echo "[deploy] Deployment successful"
