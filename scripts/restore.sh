#!/usr/bin/env bash
set -euo pipefail
umask 077

if [ $# -ne 2 ] || [ "$2" != "--confirm-destroy-current-data" ]; then
  cat >&2 <<'USAGE'
Usage: scripts/restore.sh backups/nnactpro-YYYYMMDDTHHMMSSZ.tar.gz.age --confirm-destroy-current-data

Restore stops application services, replaces the current database and upload directory, verifies the
backup checksums, applies the reviewed current schema, and restarts the stack. Run it first in an
isolated recovery environment.
USAGE
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
BACKUP_FILE="$(realpath "$1")"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup not found: $BACKUP_FILE" >&2
  exit 1
fi
if [ ! -f .env ]; then
  echo "Missing .env; restore requires the target deployment configuration." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

if command -v podman >/dev/null 2>&1; then
  COMPOSE=(podman compose)
elif command -v docker >/dev/null 2>&1; then
  COMPOSE=(docker compose)
else
  echo "Install Podman or Docker with Compose support before restoring." >&2
  exit 1
fi
if ! command -v age >/dev/null 2>&1; then
  echo "Install age encryption before restoring a production backup." >&2
  exit 1
fi
if [ -z "${BACKUP_AGE_IDENTITY_FILE:-}" ] || [ ! -f "${BACKUP_AGE_IDENTITY_FILE}" ]; then
  echo "Set BACKUP_AGE_IDENTITY_FILE to the offline age private identity used for this backup." >&2
  exit 1
fi

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/nnactpro-restore.XXXXXX")"
trap 'rm -rf "$WORK_DIR"' EXIT
age --decrypt -i "$BACKUP_AGE_IDENTITY_FILE" -o "$WORK_DIR/payload.tar.gz" "$BACKUP_FILE"
tar -xzf "$WORK_DIR/payload.tar.gz" -C "$WORK_DIR"

for required in manifest.txt SHA256SUMS ofp.dump; do
  if [ ! -f "$WORK_DIR/$required" ]; then
    echo "Backup is missing required file: $required" >&2
    exit 1
  fi
done
if ! grep -qx 'format=nnactpro-backup-v2' "$WORK_DIR/manifest.txt"; then
  echo "Unsupported backup format." >&2
  exit 1
fi
(
  cd "$WORK_DIR"
  sha256sum --check SHA256SUMS
)

export ALLOW_SCHEMA_PUSH=true
"${COMPOSE[@]}" -f infra/compose.prod.yml config >/dev/null

echo "Stopping services that can write application data..."
"${COMPOSE[@]}" -f infra/compose.prod.yml stop caddy web api worker >/dev/null 2>&1 || true
"${COMPOSE[@]}" -f infra/compose.prod.yml up -d postgres redis >/dev/null

printf 'Replacing PostgreSQL database contents...\n'
"${COMPOSE[@]}" -f infra/compose.prod.yml exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U ofp -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'ofp' AND pid <> pg_backend_pid();"
"${COMPOSE[@]}" -f infra/compose.prod.yml exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U ofp -d postgres -c "DROP DATABASE IF EXISTS ofp;"
"${COMPOSE[@]}" -f infra/compose.prod.yml exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U ofp -d postgres -c "CREATE DATABASE ofp OWNER ofp;"
"${COMPOSE[@]}" -f infra/compose.prod.yml exec -T postgres \
  pg_restore -v --exit-on-error --no-owner --no-privileges -U ofp -d ofp < "$WORK_DIR/ofp.dump"

if [ -f "$WORK_DIR/uploads.tar.gz" ]; then
  rm -rf data/uploads
  mkdir -p data
  tar -xzf "$WORK_DIR/uploads.tar.gz" -C data
fi

printf 'Building application images and applying the reviewed current schema...\n'
"${COMPOSE[@]}" -f infra/compose.prod.yml build api web worker
"${COMPOSE[@]}" -f infra/compose.prod.yml --profile tools run --rm -e ALLOW_SCHEMA_PUSH=true migrate

printf 'Starting restored application services...\n'
"${COMPOSE[@]}" -f infra/compose.prod.yml up -d api web worker caddy --remove-orphans

cat <<EOF
Restore completed from:
  $BACKUP_FILE

Do not return the deployment to users until the post-restore smoke tests, record counts, photo access,
invoice totals, authentication, and backup/restore evidence in docs/release/RELEASE_CHECKLIST.md pass.
EOF
