#!/usr/bin/env bash
# One-command OpenFieldPro deploy. Builds images, runs migrations+seed, brings
# the stack up behind Caddy on :8080. Works with podman or docker compose.
#   ./deploy.sh           # build + up
#   ./deploy.sh down      # tear down
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE="podman compose"
command -v podman >/dev/null 2>&1 || COMPOSE="docker compose"

if [ "${1:-up}" = "down" ]; then
  $COMPOSE -f infra/compose.prod.yml down
  exit 0
fi

[ -f .env ] || { echo "→ creating .env from .env.example (edit secrets before a real deploy!)"; cp .env.example .env; }

echo "→ building + starting stack with: $COMPOSE"
$COMPOSE -f infra/compose.prod.yml up -d --build

echo
echo "✓ OpenFieldPro is starting."
echo "  App:      http://localhost:8080"
echo "  Landing:  http://localhost:8080/welcome"
echo "  API:      http://localhost:8080/api/health"
echo "  Login:    owner@demo.test / demo12345"
