#!/usr/bin/env bash
# Export nnact.com marketing static files to NNPMARKETING_ROOT (default data/marketing/dist under the app).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MARKETING_ROOT="${NNPMARKETING_ROOT:-${ROOT_DIR}/data/marketing/dist}"
mkdir -p "$MARKETING_ROOT"

if command -v docker >/dev/null 2>&1; then
  BUILD=(docker buildx build)
else
  echo "Docker is required to build the marketing site." >&2
  exit 1
fi

echo "Building marketing site into $MARKETING_ROOT ..."
BUILD_ARGS=()
if [ "${MARKETING_FRESH:-true}" = "true" ]; then
  BUILD_ARGS+=(--no-cache)
fi
"${BUILD[@]}" -f infra/marketing/Dockerfile \
  "${BUILD_ARGS[@]}" \
  --output "type=local,dest=${MARKETING_ROOT}" \
  .

echo "Marketing site ready: $MARKETING_ROOT"
