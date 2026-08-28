#!/usr/bin/env bash
# Export nnact.com marketing static files to NNPMARKETING_ROOT.
# Requires a local nnact-webapp checkout (MARKETING_SOURCE) — the repo is private.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MARKETING_ROOT="${NNPMARKETING_ROOT:-${ROOT_DIR}/data/marketing/dist}"
MARKETING_SOURCE="${MARKETING_SOURCE:-${NNPMARKETING_SOURCE:-}}"

mkdir -p "$MARKETING_ROOT"

if [ -f "${MARKETING_ROOT}/index.html" ] && [ "${MARKETING_FRESH:-false}" != "true" ]; then
  echo "Marketing dist already present at $MARKETING_ROOT, skipping build."
  exit 0
fi

if [ -z "$MARKETING_SOURCE" ] || [ ! -f "${MARKETING_SOURCE}/package.json" ]; then
  echo "Marketing source not available (set MARKETING_SOURCE to a nnact-webapp checkout)." >&2
  echo "Deploy the nnact-webapp repository or sync dist/ to $MARKETING_ROOT." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to build the marketing site." >&2
  exit 1
fi

echo "Building marketing site from $MARKETING_SOURCE into $MARKETING_ROOT ..."
BUILD_ARGS=()
if [ "${MARKETING_FRESH:-true}" = "true" ]; then
  BUILD_ARGS+=(--no-cache)
fi

docker buildx build -f infra/marketing/Dockerfile \
  "${BUILD_ARGS[@]}" \
  --build-context "marketing=${MARKETING_SOURCE}" \
  --output "type=local,dest=${MARKETING_ROOT}" \
  .

echo "Marketing site ready: $MARKETING_ROOT"
