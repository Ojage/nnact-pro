#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "Created .env from .env.example. Review secrets before public deployment."
  else
    cat > .env <<'ENV'
POSTGRES_PASSWORD=ofp
JWT_SECRET=change-me-in-production
PUBLIC_API_URL=http://localhost:8080/api
ENV
    echo "Created starter .env. Review secrets before public deployment."
  fi
fi

if command -v podman >/dev/null 2>&1; then
  COMPOSE="podman compose"
elif command -v docker >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  echo "Install Podman or Docker before running this script." >&2
  exit 1
fi

$COMPOSE -f infra/compose.prod.yml up -d --build

echo "OpenFieldPro is starting."
echo "App:      http://localhost:8080"
echo "Landing:  http://localhost:8080/welcome"
echo "API:      http://localhost:8080/api/health"
