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

# shellcheck source=scripts/reconcile-cors.sh
source scripts/reconcile-cors.sh
reconcile_cors

export ALLOW_SCHEMA_PUSH=true

"${COMPOSE[@]}" -f infra/compose.prod.yml config >/dev/null

echo "Building production images (this may take several minutes)..."
"${COMPOSE[@]}" -f infra/compose.prod.yml build api web worker migrate

echo "Starting data services..."
"${COMPOSE[@]}" -f infra/compose.prod.yml up -d postgres redis

# Provision the ops maintenance state file. api/worker mount the volume
# read-only, so the file must exist on the host; a missing file is treated as
# "maintenance active" (fail-closed) and 503s every mutating request.
# Preserve an intentional active:true flag — only recreate the file when it
# is genuinely absent. postgis image is present at this point.
OPS_STATE="$(docker volume inspect --format '{{.Mountpoint}}' "${NNPOPERATIONS_STATE_VOLUME:-openfieldpro_operations_state}" 2>/dev/null || true)"
if [ -n "$OPS_STATE" ] && [ ! -f "$OPS_STATE/maintenance.json" ]; then
  echo "Provisioning maintenance state file at $OPS_STATE/maintenance.json"
  docker run --rm -v "${NNPOPERATIONS_STATE_VOLUME:-openfieldpro_operations_state}:/state" \
    postgis/postgis:16-3.4 sh -c 'printf "%s\n" "{\"version\":1,\"active\":false}" > /state/maintenance.json'
fi

echo "Applying database migrations..."
"${COMPOSE[@]}" -f infra/compose.prod.yml --profile tools run --build --rm -e ALLOW_SCHEMA_PUSH=true migrate

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

echo "Verifying production CORS origins..."
verify_cors

echo "Deploy complete."
echo "Staff app:  https://${NNPSITE_ADDRESS:-unknown}"
echo "API:        https://${NNPAPI_ADDRESS:-unknown}/api/health"
echo "Marketing:  https://${NNPMARKETING_ADDRESS:-nnact.com}"
