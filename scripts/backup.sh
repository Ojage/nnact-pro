#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo "Missing .env; backup requires the production compose configuration." >&2
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
  echo "Install Podman or Docker with Compose support before running a backup." >&2
  exit 1
fi
if ! command -v age >/dev/null 2>&1; then
  echo "Install age encryption before creating a production backup." >&2
  exit 1
fi
if ! command -v sha256sum >/dev/null 2>&1; then
  echo "sha256sum is required to create the integrity manifest." >&2
  exit 1
fi
if [ -z "${BACKUP_AGE_RECIPIENT:-}" ]; then
  echo "Set BACKUP_AGE_RECIPIENT to an age public recipient. The private identity must be stored separately." >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_ROOT="${OFP_BACKUP_DIR:-$ROOT_DIR/backups}"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/openfieldpro-backup.XXXXXX")"
OUTPUT="$BACKUP_ROOT/openfieldpro-$STAMP.tar.gz.age"
trap 'rm -rf "$WORK_DIR"' EXIT
mkdir -p "$BACKUP_ROOT"
if [ -e "$OUTPUT" ]; then
  echo "Refusing to overwrite existing backup: $OUTPUT" >&2
  exit 1
fi

export ALLOW_SCHEMA_PUSH=true
"${COMPOSE[@]}" -f infra/compose.prod.yml config >/dev/null
"${COMPOSE[@]}" -f infra/compose.prod.yml up -d postgres >/dev/null

printf 'Creating PostgreSQL custom-format dump...\n'
"${COMPOSE[@]}" -f infra/compose.prod.yml exec -T postgres \
  pg_dump -U ofp -d ofp --format=custom --no-owner --no-privileges > "$WORK_DIR/ofp.dump"

if [ -d data/uploads ]; then
  tar -C data -czf "$WORK_DIR/uploads.tar.gz" uploads
fi

GIT_COMMIT="unknown"
if command -v git >/dev/null 2>&1; then
  GIT_COMMIT="$(git rev-parse HEAD 2>/dev/null || printf unknown)"
fi
cat > "$WORK_DIR/manifest.txt" <<EOF
format=openfieldpro-backup-v2
created_at=$STAMP
git_commit=$GIT_COMMIT
database=postgresql-custom
uploads=$([ -f "$WORK_DIR/uploads.tar.gz" ] && printf included || printf absent)
secrets=excluded
EOF

(
  cd "$WORK_DIR"
  sha256sum ofp.dump manifest.txt > SHA256SUMS
  if [ -f uploads.tar.gz ]; then sha256sum uploads.tar.gz >> SHA256SUMS; fi
  tar -czf payload.tar.gz ofp.dump manifest.txt SHA256SUMS $([ -f uploads.tar.gz ] && printf uploads.tar.gz)
)

age -r "$BACKUP_AGE_RECIPIENT" -o "$OUTPUT" "$WORK_DIR/payload.tar.gz"
chmod 600 "$OUTPUT"

printf 'Encrypted backup written to %s\n' "$OUTPUT"
printf 'Secrets and .env were intentionally excluded. Store the age identity separately and test restore in isolation.\n'
