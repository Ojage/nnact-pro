#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="backups/$STAMP"
mkdir -p "$BACKUP_DIR"

if command -v podman >/dev/null 2>&1; then
  COMPOSE="podman compose"
elif command -v docker >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  echo "Install Podman or Docker before running this script." >&2
  exit 1
fi

$COMPOSE -f infra/compose.prod.yml exec -T postgres pg_dump -U ofp -d ofp > "$BACKUP_DIR/ofp.sql"

if [ -d data/minio ]; then
  tar -czf "$BACKUP_DIR/minio.tar.gz" data/minio
fi

if [ -f .env ]; then
  cp .env "$BACKUP_DIR/.env.copy"
fi

echo "Backup written to $BACKUP_DIR"
