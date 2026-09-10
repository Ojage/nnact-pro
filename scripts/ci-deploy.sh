#!/usr/bin/env bash
# Remote production deploy — invoked by GitHub Actions over SSH.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Fail loudly before touching anything if the git object store is not writable
# by the deploy user (e.g. when a manual root-side git command left root-owned
# objects behind). A missing write permission would otherwise abort the fetch
# below in a way that the CI poll loop can mistake for a successful deploy.
if ! ( cd .git/objects && mkdir .nnact-write-probe 2>/dev/null ); then
  echo "ERROR: .git is not writable by $(id -un). Fix ownership on the VPS (chown -R <deploy-user> .git) and retry." >&2
  exit 1
fi
rmdir .git/objects/.nnact-write-probe

if [ -n "${NNACT_PRO_ENV:-}" ]; then
  umask 077

  # Preserve any manually-added keys (e.g. LinkedIn/Meta OAuth creds) that
  # are not managed by the CI secret.  We compare key names so CI-managed
  # values always win, but server-side additions survive across deploys.
  ENV_PREV=".env.prev"
  if [ -f .env ]; then
    cp .env "$ENV_PREV"
  fi

  printf '%s\n' "$NNACT_PRO_ENV" > .env

  if [ -f "$ENV_PREV" ]; then
    while IFS= read -r line; do
      # Skip blanks and comments
      [[ -z "$line" || "$line" =~ ^# ]] && continue
      key="${line%%=*}"
      # If this key is NOT already in the new .env, carry it forward
      if ! grep -q "^${key}=" .env 2>/dev/null; then
        echo "$line" >> .env
      fi
    done < "$ENV_PREV"
    rm -f "$ENV_PREV"
  fi
fi

if [ ! -f .env ]; then
  echo "Missing .env. Set NNACT_PRO_ENV secret or create .env on the server." >&2
  exit 1
fi

if command -v docker >/dev/null 2>&1; then
  COMPOSE=(docker compose)
else
  echo "Docker is required on the VPS." >&2
  exit 1
fi

if [ "${CI_DEPLOY_SKIP_GIT:-}" != "true" ]; then
  echo "Fetching latest main..."
  git fetch origin main
  git reset --hard origin/main
else
  echo "Skipping git pull (CI rsync deploy)."
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

# shellcheck source=scripts/reconcile-cors.sh
source scripts/reconcile-cors.sh
reconcile_cors

export ALLOW_SCHEMA_PUSH=true

"${COMPOSE[@]}" -f infra/compose.prod.yml config >/dev/null

# ---------------------------------------------------------------------------
# Change-aware builds: rebuild only the images whose source actually moved,
# so an api-only or web-only commit deploys in seconds instead of minutes.
# `data/.deployed-sha` records the last successfully deployed commit; the first
# deploy (or a missing image) falls back to building everything.
# ---------------------------------------------------------------------------
API_IMG="${NNPAPI_IMAGE:-nnact/api:prod}"
WEB_IMG="${NNPWEB_IMAGE:-nnact/web:prod}"
WORKER_IMG="${NNPWORKER_IMAGE:-nnact/worker:prod}"

DEPLOY_MARKER="data/.deployed-sha"
mkdir -p "$(dirname "$DEPLOY_MARKER")"
LAST_SHA="$(cat "$DEPLOY_MARKER" 2>/dev/null || true)"

build_all=false
needs_api=false
needs_web=false
needs_worker=false
needs_migrate=false

if [ "${CI_DEPLOY_SKIP_GIT:-}" = "true" ] || [ -z "$LAST_SHA" ]; then
  build_all=true
else
  # Pure classifier in scripts/change-detect.mjs (unit-tested) maps the
  # changed-file set to the images that must be rebuilt. It runs inside a
  # throwaway node container so the VPS does not need node installed; git is
  # already present, so the diff is computed here on the host.
  DETECT_OUT="$(git diff --name-only "$LAST_SHA"..HEAD \
    | docker run -i --rm \
        -v "$ROOT_DIR/scripts:/scripts:ro" \
        node:22-alpine node /scripts/change-detect.mjs --stdin)" || true
  eval "$DETECT_OUT"
  if [ -z "${API:-}" ]; then
    echo "Change detection failed — falling back to a full rebuild."
    build_all=true
  else
    needs_api="$API"
    needs_web="$WEB"
    needs_worker="$WORKER"
    needs_migrate="$MIGRATE"
    if [ "$ALL" = "true" ]; then
      echo "Everything changed — rebuilding all images."
    fi
  fi
fi

if [ "$build_all" = true ]; then
  needs_api=true
  needs_web=true
  needs_worker=true
  needs_migrate=true
  echo "No previous deploy marker — building all images."
fi

# A missing image must always be (re)built even when nothing changed on disk.
for pair in "api:$API_IMG" "web:$WEB_IMG" "worker:$WORKER_IMG"; do
  key="${pair%%:*}"; img="${pair#*:}"
  if ! docker image inspect "$img" >/dev/null 2>&1; then
    echo "Image $img missing — forcing a rebuild."
    case "$key" in
      api) needs_api=true ;;
      web) needs_web=true ;;
      worker) needs_worker=true ;;
    esac
  fi
done

TO_BUILD=()
[ "$needs_api" = true ] && TO_BUILD+=(api)
[ "$needs_web" = true ] && TO_BUILD+=(web)
[ "$needs_worker" = true ] && TO_BUILD+=(worker)

echo "Affected images: ${TO_BUILD[*]:-none} (previous commit: ${LAST_SHA:-none})"
if [ "${#TO_BUILD[@]}" -gt 0 ]; then
  echo "Building production images..."
  "${COMPOSE[@]}" -f infra/compose.prod.yml build "${TO_BUILD[@]}"
else
  echo "No image sources changed — reusing existing images."
fi

echo "Starting data services..."
"${COMPOSE[@]}" -f infra/compose.prod.yml up -d postgres redis

# Provision the ops maintenance state file. api/worker mount the volume
# read-only, so the file must exist on the host; a missing file is treated as
# "maintenance active" (fail-closed) and 503s every mutating request.
# Preserve an intentional active:true flag — only recreate the file when it
# is genuinely absent. postgis image is present at this point.
OPS_STATE="$(docker volume inspect --format '{{.Mountpoint}}' "${NNPOPERATIONS_STATE_VOLUME:-openfieldpro_operations_state}" 2>/dev/null || true)"
if [ -n "$OPS_STATE" ] && [ ! -f "$OPS_STATE/maintenance.json" ]; then
  echo "Provisioning maintenance state file at $OPS_STATE/maintenance.json"
  docker run --rm -v "${NNPOPERATIONS_STATE_VOLUME:-openfieldpro_operations_state}:/state" \
    postgis/postgis:16-3.4 sh -c 'printf "%s\n" "{\"version\":1,\"active\":false}" > /state/maintenance.json'
fi

if [ "$needs_migrate" = true ]; then
  echo "Applying database migrations..."
  "${COMPOSE[@]}" -f infra/compose.prod.yml --profile tools run --rm -e ALLOW_SCHEMA_PUSH=true migrate
else
  echo "No database changes — skipping migrations."
fi

echo "Starting application stack..."
"${COMPOSE[@]}" -f infra/compose.prod.yml up -d api web worker caddy --remove-orphans

echo "Waiting for services to become healthy..."
healthy=false
for _attempt in $(seq 1 60); do
  any_unhealthy=false
  all_ready=true
  for svc in api web worker; do
    cid="$(${COMPOSE[@]} -f infra/compose.prod.yml ps -q "$svc" 2>/dev/null | tr -d '[:space:]')"
    if [ -z "$cid" ]; then
      all_ready=false
      continue
    fi
    state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null)"
    case "$state" in
      healthy) ;;
      running) ;; # no healthcheck configured -> Up is good enough
      starting | "")
        all_ready=false ;;
      *)
        echo "Service $svc is in bad state ($state)." >&2
        any_unhealthy=true ;;
    esac
  done
  if [ "$any_unhealthy" = true ]; then
    echo "A service became unhealthy — aborting." >&2
    "${COMPOSE[@]}" -f infra/compose.prod.yml ps >&2
    exit 1
  fi
  if [ "$all_ready" = true ]; then
    healthy=true
    break
  fi
  sleep 3
done

if [ "$healthy" != true ]; then
  echo "Services did not reach the expected running state." >&2
  "${COMPOSE[@]}" -f infra/compose.prod.yml ps >&2
  exit 1
fi

echo "Building marketing site..."
if [ "${MARKETING_SKIP_BUILD:-false}" = "true" ]; then
  if [ ! -f "${NNPMARKETING_ROOT:-data/marketing/dist}/index.html" ]; then
    echo "MARKETING_SKIP_BUILD=true but marketing dist is missing." >&2
    exit 1
  fi
  echo "Marketing dist already synced; skipping build."
else
  bash scripts/deploy-marketing.sh
fi

echo "Verifying production CORS origins..."
verify_cors

# Record the commit now on disk so the NEXT deploy can skip images that did
# not change. Written only after every step above succeeded.
if [ "${CI_DEPLOY_SKIP_GIT:-}" != "true" ]; then
  printf '%s\n' "$(git rev-parse HEAD)" > "$DEPLOY_MARKER"
  echo "Deploy marker updated to $(cat "$DEPLOY_MARKER")."
fi

echo "Deploy complete."
echo "Staff app:  https://${NNPSITE_ADDRESS:-unknown}"
echo "API:        https://${NNPAPI_ADDRESS:-unknown}/api/health"
echo "Marketing:  https://${NNPMARKETING_ADDRESS:-nnact.com}"
