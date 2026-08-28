#!/usr/bin/env bash
# Marketing-only deploy — used by nnact-webapp GitHub Actions.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo "Missing .env at $ROOT_DIR/.env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

export MARKETING_FRESH=true
bash scripts/deploy-marketing.sh

if command -v docker >/dev/null 2>&1; then
  docker compose -f infra/compose.prod.yml exec -T caddy caddy reload --config /etc/caddy/Caddyfile 2>/dev/null \
    || docker compose -f infra/compose.prod.yml restart caddy 2>/dev/null \
    || true
fi

echo "Marketing deploy complete: https://${NNPMARKETING_ADDRESS:-nnact.com}"
