#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if command -v podman >/dev/null 2>&1; then
  COMPOSE=(podman compose)
elif command -v docker >/dev/null 2>&1; then
  COMPOSE=(docker compose)
else
  echo "Install Podman or Docker with Compose support before deploying." >&2
  exit 1
fi

case "${1:-}" in
  down)
    "${COMPOSE[@]}" -f infra/compose.prod.yml down
    exit 0
    ;;
  --apply-schema)
    ;;
  *)
    cat >&2 <<'USAGE'
Usage:
  ./deploy.sh --apply-schema   Validate configuration, build, apply the reviewed schema, and start
  ./deploy.sh down             Stop the stack without deleting persistent data

Production deployment is intentionally blocked without --apply-schema because schema push is a
potentially destructive operation. Review the generated schema diff and complete the release
checklist before continuing.
USAGE
    exit 2
    ;;
esac

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example, replace every production placeholder, and keep the file outside version control." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

required=(POSTGRES_PASSWORD JWT_SECRET CORS_ORIGIN PUBLIC_WEB_URL PUBLIC_API_URL OFP_SITE_ADDRESS)
for name in "${required[@]}"; do
  if [ -z "${!name:-}" ]; then
    echo "Missing required production setting: $name" >&2
    exit 1
  fi
done

if [ "${JWT_SECRET}" = "change-me-in-production" ] || [ "${#JWT_SECRET}" -lt 32 ]; then
  echo "JWT_SECRET must be unique and at least 32 characters." >&2
  exit 1
fi
if [[ "${CORS_ORIGIN}" == *"*"* ]]; then
  echo "CORS_ORIGIN cannot contain a wildcard." >&2
  exit 1
fi
if [[ ! "${PUBLIC_WEB_URL}" =~ ^https:// ]] || [[ ! "${PUBLIC_API_URL}" =~ ^https:// ]]; then
  echo "PUBLIC_WEB_URL and PUBLIC_API_URL must use HTTPS for production." >&2
  exit 1
fi

export ALLOW_SCHEMA_PUSH=true
"${COMPOSE[@]}" -f infra/compose.prod.yml config >/dev/null

echo "Running repository release-safety checks..."
corepack enable >/dev/null 2>&1 || true
corepack prepare pnpm@9.0.0 --activate >/dev/null
pnpm install:verified
pnpm release:safety
pnpm audit --prod --audit-level=high

echo "Building and starting the production stack..."
"${COMPOSE[@]}" -f infra/compose.prod.yml up -d --build --remove-orphans

echo "Waiting for service health..."
for attempt in $(seq 1 30); do
  if "${COMPOSE[@]}" -f infra/compose.prod.yml ps --format json 2>/dev/null | grep -q '"Health":"unhealthy"'; then
    echo "A service became unhealthy." >&2
    "${COMPOSE[@]}" -f infra/compose.prod.yml ps >&2
    exit 1
  fi
  if "${COMPOSE[@]}" -f infra/compose.prod.yml ps 2>/dev/null | grep -q "api"; then
    break
  fi
  sleep 2
done

cat <<EOF
OpenFieldPro deployment started.
App:     https://${OFP_SITE_ADDRESS}
Landing: https://${OFP_SITE_ADDRESS}/welcome
API:     https://${OFP_SITE_ADDRESS}/api/health

Complete the post-deploy smoke tests in docs/release/RELEASE_CHECKLIST.md before directing users here.
EOF
