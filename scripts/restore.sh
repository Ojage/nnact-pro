#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: scripts/restore.sh backups/YYYYMMDD-HHMMSS" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
BACKUP_DIR="$1"

if [ ! -f "$BACKUP_DIR/ofp.sql" ]; then
  echo "Missing $BACKUP_DIR/ofp.sql" >&2
  exit 1
fi

if command -v podman >/dev/null 2>&1; then
  COMPOSE="podman compose"
elif command -v docker >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  echo "Install Podman or Docker before running this script." >&2
  exit 1
fi

$COMPOSE -f infra/compose.prod.yml up -d postgres
$COMPOSE -f infra/compose.prod.yml exec -T postgres psql -U ofp -d ofp -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
$COMPOSE -f infra/compose.prod.yml exec -T postgres psql -U ofp -d ofp < "$BACKUP_DIR/ofp.sql"

if [ -f "$BACKUP_DIR/minio.tar.gz" ]; then
  tar -xzf "$BACKUP_DIR/minio.tar.gz"
fi

echo "Restore complete. Restarting stack."
$COMPOSE -f infra/compose.prod.yml up -d
