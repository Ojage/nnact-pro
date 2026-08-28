#!/usr/bin/env bash
# Remote production deploy — invoked by GitHub Actions over SSH.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -n "${NNACT_PRO_ENV:-}" ]; then
  umask 077
  printf '%s\n' "$NNACT_PRO_ENV" > .env
fi

if [ ! -f .env ]; then
  echo "Missing .env. Set NNACT_PRO_ENV secret or create .env on the server." >&2
  exit 1
fi

if command -v docker >/dev/null 2>&1; then
  COMPOSE=(docker compose)
else
  echo "Docker is required on the VPS." >&2
  exit 1
fi

if [ "${CI_DEPLOY_SKIP_GIT:-}" != "true" ]; then
  echo "Fetching latest main..."
  git fetch origin main
  git reset --hard origin/main
else
  echo "Skipping git pull (CI rsync deploy)."
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

export ALLOW_SCHEMA_PUSH=true

"${COMPOSE[@]}" -f infra/compose.prod.yml config >/dev/null

echo "Building production images (this may take several minutes)..."
"${COMPOSE[@]}" -f infra/compose.prod.yml build api web worker

echo "Starting data services..."
"${COMPOSE[@]}" -f infra/compose.prod.yml up -d postgres redis

echo "Applying database migrations..."
"${COMPOSE[@]}" -f infra/compose.prod.yml --profile tools run --rm -e ALLOW_SCHEMA_PUSH=true migrate

echo "Starting application stack..."
"${COMPOSE[@]}" -f infra/compose.prod.yml up -d api web worker caddy --remove-orphans

echo "Waiting for services..."
healthy=false
for _attempt in $(seq 1 60); do
  status="$(${COMPOSE[@]} -f infra/compose.prod.yml ps 2>/dev/null || true)"
  if printf '%s\n' "$status" | grep -qi "unhealthy"; then
    echo "A service became unhealthy." >&2
    printf '%s\n' "$status" >&2
    exit 1
  fi
  if printf '%s\n' "$status" | grep -q "api" && printf '%s\n' "$status" | grep -q "web"; then
    healthy=true
    break
  fi
  sleep 3
done

if [ "$healthy" != true ]; then
  echo "Services did not reach the expected running state." >&2
  "${COMPOSE[@]}" -f infra/compose.prod.yml ps >&2
  exit 1
fi

echo "Building marketing site..."
if [ "${MARKETING_SKIP_BUILD:-false}" = "true" ]; then
  if [ ! -f "${NNPMARKETING_ROOT:-data/marketing/dist}/index.html" ]; then
    echo "MARKETING_SKIP_BUILD=true but marketing dist is missing." >&2
    exit 1
  fi
  echo "Marketing dist already synced; skipping build."
else
  bash scripts/deploy-marketing.sh
fi

echo "Deploy complete."
echo "Staff app:  https://${NNPSITE_ADDRESS:-unknown}"
echo "API:        https://${NNPAPI_ADDRESS:-unknown}/api/health"
echo "Marketing:  https://${NNPMARKETING_ADDRESS:-nnact.com}"
