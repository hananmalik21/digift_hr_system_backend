#!/usr/bin/env bash

set -euo pipefail

APP_DIR="/home/ubuntu/apps/backend"
WALLET_DIR="/home/ubuntu/secrets/digify-wallet"
GITHUB_DEPLOY_KEY="${GITHUB_DEPLOY_KEY:-$HOME/.ssh/github_digify_deploy}"

echo "[deploy] Starting DigifyHR backend deployment"

cd "$APP_DIR"

# --------------------------------------------------
# Required application files
# --------------------------------------------------

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

# --------------------------------------------------
# Oracle wallet
# Wallet is external to the Git repository and image
# --------------------------------------------------

if [ ! -d "$WALLET_DIR" ]; then
    echo "[deploy] ERROR: Oracle wallet directory not found: $WALLET_DIR"
    exit 1
fi

if [ ! -f "$WALLET_DIR/cwallet.sso" ]; then
    echo "[deploy] ERROR: $WALLET_DIR/cwallet.sso not found"
    exit 1
fi

if [ ! -f "$WALLET_DIR/tnsnames.ora" ]; then
    echo "[deploy] ERROR: $WALLET_DIR/tnsnames.ora not found"
    exit 1
fi

if [ ! -f "$WALLET_DIR/sqlnet.ora" ]; then
    echo "[deploy] ERROR: $WALLET_DIR/sqlnet.ora not found"
    exit 1
fi

# --------------------------------------------------
# GitHub SSH access
# Required because npm ci installs private Git repos:
#   - digify_hr_grc-backend
#   - digify_hr_backend_common
# --------------------------------------------------

if [ ! -f "$GITHUB_DEPLOY_KEY" ]; then
    echo "[deploy] ERROR: GitHub deploy key not found: $GITHUB_DEPLOY_KEY"
    exit 1
fi

chmod 600 "$GITHUB_DEPLOY_KEY"
chmod 600 "$APP_DIR/firebase-service-account.json"

echo "[deploy] Starting temporary SSH agent..."

eval "$(ssh-agent -s)" >/dev/null

cleanup_ssh_agent() {
    if [ -n "${SSH_AGENT_PID:-}" ]; then
        ssh-agent -k >/dev/null 2>&1 || true
    fi
}

trap cleanup_ssh_agent EXIT

ssh-add "$GITHUB_DEPLOY_KEY" >/dev/null

echo "[deploy] GitHub SSH identity loaded"

# --------------------------------------------------
# Verify private repository access before Docker build
# --------------------------------------------------

echo "[deploy] Verifying GRC repository access..."

git ls-remote \
    git@github.com:hananmalik21/digify_hr_grc-backend.git \
    refs/tags/v1.1.0 \
    >/dev/null

echo "[deploy] Verifying common repository access..."

git ls-remote \
    git@github.com:hananmalik21/digify_hr_backend_common.git \
    refs/tags/v1.2.0 \
    >/dev/null

echo "[deploy] Private GitHub repositories accessible"

# --------------------------------------------------
# Docker Compose validation
# --------------------------------------------------

echo "[deploy] Validating Docker Compose configuration..."

docker compose config >/dev/null

# --------------------------------------------------
# Build
#
# SSH key is forwarded temporarily through BuildKit.
# It is NOT copied into the Docker image.
# --------------------------------------------------

export DOCKER_BUILDKIT=1

echo "[deploy] Building backend image..."

docker compose build --ssh default

# --------------------------------------------------
# Start / replace container
# --------------------------------------------------

echo "[deploy] Starting backend through Docker Compose..."

docker compose up -d --force-recreate --remove-orphans

echo "[deploy] Waiting for backend startup..."

sleep 8

echo "[deploy] Container status:"

docker compose ps

# --------------------------------------------------
# Verify container state
# --------------------------------------------------

echo "[deploy] Verifying container is running..."

STATUS="$(docker inspect digift-backend --format='{{.State.Status}}')"

if [ "$STATUS" != "running" ]; then
    echo "[deploy] ERROR: backend container is not running"
    docker logs --tail 150 digift-backend || true
    exit 1
fi

# --------------------------------------------------
# Verify Firebase runtime configuration
# --------------------------------------------------

echo "[deploy] Verifying Firebase environment..."

docker inspect digift-backend \
    --format='{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -q '^GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/firebase-service-account.json$'

echo "[deploy] Verifying Firebase credential mount..."

docker inspect digift-backend \
    --format='{{range .Mounts}}{{println .Destination}}{{end}}' \
    | grep -q '^/run/secrets/firebase-service-account.json$'

# --------------------------------------------------
# Verify Oracle wallet runtime configuration
# --------------------------------------------------

echo "[deploy] Verifying Oracle wallet environment..."

docker inspect digift-backend \
    --format='{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -q '^TNS_ADMIN=/app/Wallet$'

docker inspect digift-backend \
    --format='{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -q '^ORACLE_WALLET_PATH=/app/Wallet$'

echo "[deploy] Verifying Oracle wallet mount..."

WALLET_MOUNT="$(
    docker inspect digift-backend \
        --format='{{range .Mounts}}{{if eq .Destination "/app/Wallet"}}{{println .Source "|" .Destination "|" .RW}}{{end}}{{end}}'
)"

if [ -z "$WALLET_MOUNT" ]; then
    echo "[deploy] ERROR: /app/Wallet mount not found"
    exit 1
fi

echo "[deploy] Wallet mount: $WALLET_MOUNT"

if ! echo "$WALLET_MOUNT" | grep -q "^${WALLET_DIR} | /app/Wallet | false"; then
    echo "[deploy] ERROR: Oracle wallet is not mounted read-only from $WALLET_DIR"
    exit 1
fi

# --------------------------------------------------
# Verify wallet files inside container
# --------------------------------------------------

echo "[deploy] Verifying Oracle wallet files inside container..."

docker exec digift-backend sh -lc '
    test -f /app/Wallet/cwallet.sso &&
    test -f /app/Wallet/tnsnames.ora &&
    test -f /app/Wallet/sqlnet.ora
'

# --------------------------------------------------
# Verify installed Git packages
# --------------------------------------------------

echo "[deploy] Verifying GRC package..."

docker exec digift-backend \
    npm ls digify-hr-grc-backend --depth=1

echo "[deploy] Verifying @digifyhr/common..."

docker exec digift-backend \
    npm ls @digifyhr/common --depth=2

# --------------------------------------------------
# Health check
# --------------------------------------------------

echo "[deploy] Checking backend health..."

HEALTH_OK=false

for attempt in {1..12}; do
    if curl --fail --silent \
        http://127.0.0.1:3000/health \
        >/dev/null; then

        HEALTH_OK=true
        break
    fi

    echo "[deploy] Health not ready yet (${attempt}/12)"
    sleep 5
done

if [ "$HEALTH_OK" != "true" ]; then
    echo "[deploy] ERROR: health check failed"
    docker logs --tail 150 digift-backend || true
    exit 1
fi

echo "[deploy] Health check passed"

# --------------------------------------------------
# GRC smoke test
# --------------------------------------------------

echo "[deploy] Checking GRC API..."

if ! curl --fail --silent \
    "http://127.0.0.1:3000/api/grc/question-categories?enterprise_id=9" \
    >/dev/null; then

    echo "[deploy] ERROR: GRC smoke test failed"
    docker logs --tail 150 digift-backend || true
    exit 1
fi

echo "[deploy] GRC smoke test passed"

# --------------------------------------------------
# Final status
# --------------------------------------------------

echo
echo "============================================"
echo "[deploy] Deployment successful"
echo "============================================"
echo "[deploy] Container       : digift-backend"
echo "[deploy] Health          : PASS"
echo "[deploy] GRC             : PASS"
echo "[deploy] Oracle wallet   : external/read-only"
echo "[deploy] Firebase secret : runtime mount"
echo "[deploy] GitHub SSH      : BuildKit forwarding only"
echo "============================================"
