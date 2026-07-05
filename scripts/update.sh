#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if command -v podman >/dev/null 2>&1; then
  COMPOSE="podman compose"
elif command -v docker >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  echo "Install Podman or Docker before running this script." >&2
  exit 1
fi

git pull --ff-only
$COMPOSE -f infra/compose.prod.yml build
$COMPOSE -f infra/compose.prod.yml up -d

echo "OpenFieldPro updated. Check health at http://localhost:8080/api/health"
