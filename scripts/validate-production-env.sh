#!/usr/bin/env bash
# Validates /srv/nnact-pro/.env (or repo .env) before deploy. Sources nothing itself —
# caller must `set -a; source .env; set +a` first.
set -euo pipefail

errors=0
warnings=0

fail() {
  echo "ERROR: $*" >&2
  errors=$((errors + 1))
}

warn() {
  echo "WARN: $*" >&2
  warnings=$((warnings + 1))
}

# ── Core (deploy.sh also checks these) ───────────────────────────────────────
for name in POSTGRES_PASSWORD JWT_SECRET CORS_ORIGIN PUBLIC_WEB_URL PUBLIC_API_URL NNPSITE_ADDRESS NNPAPI_ADDRESS NNPMARKETING_ADDRESS; do
  if [ -z "${!name:-}" ]; then
    fail "Missing required setting: $name"
  fi
done

if [ -z "${REDIS_URL:-}" ]; then
  warn "REDIS_URL unset — compose sets redis://redis:6379 inside the stack; set explicitly if running API outside compose."
fi

# ── Email (required for customer portal + permission Growth mail) ───────────
if [ -z "${SMTP_HOST:-}" ] || [ -z "${SMTP_USER:-}" ] || [ -z "${SMTP_PASS:-}" ]; then
  fail "SMTP_HOST, SMTP_USER, and SMTP_PASS are required in production for outbound email (Resend or other SMTP)."
fi

if [ -n "${SMTP_HOST:-}" ] && echo "${SMTP_HOST}" | grep -qi resend; then
  if [ -n "${COLD_SMTP_HOST:-}" ] && echo "${COLD_SMTP_HOST}" | grep -qi resend; then
    fail "COLD_SMTP_HOST must not use smtp.resend.com — Resend prohibits cold outreach."
  fi
fi

if [ -z "${SMTP_FROM:-}" ]; then
  warn "SMTP_FROM is unset — falls back to SMTP_USER; set a branded From for NNACT."
fi

# ── Growth ─────────────────────────────────────────────────────────────────
if [ "${GROWTH_SCHEDULER_ENABLED:-false}" = "true" ]; then
  if [ -z "${COLD_SMTP_HOST:-}" ] || [ -z "${COLD_SMTP_USER:-}" ] || [ -z "${COLD_SMTP_PASS:-}" ]; then
    warn "GROWTH_SCHEDULER_ENABLED=true but cold SMTP is not fully configured — scheduled cold sends will refuse until COLD_SMTP_* is set."
  fi
fi

if [ -z "${GROWTH_INBOUND_WEBHOOK_SECRET:-}" ] || [ "${#GROWTH_INBOUND_WEBHOOK_SECRET}" -lt 16 ]; then
  warn "GROWTH_INBOUND_WEBHOOK_SECRET missing or short (<16) — inbound reply webhooks will reject until configured."
fi

if [ -n "${EXPLEE_READ_API_URL:-}" ] && [ -z "${EXPLEE_READ_API_TOKEN:-}" ]; then
  fail "EXPLEE_READ_API_URL is set but EXPLEE_READ_API_TOKEN is missing."
fi
if [ -n "${EXPLEE_READ_API_TOKEN:-}" ] && [ -z "${EXPLEE_READ_API_URL:-}" ]; then
  fail "EXPLEE_READ_API_TOKEN is set but EXPLEE_READ_API_URL is missing."
fi

if [ -n "${COLD_SMTP_HOST:-}" ]; then
  for v in COLD_SMTP_USER COLD_SMTP_PASS; do
    if [ -z "${!v:-}" ]; then
      fail "COLD_SMTP_HOST is set but $v is missing — cold transport stays disabled."
    fi
  done
fi

# ── AI provider keys live in DB (org settings), not env — no check here ─────

echo "Production env validation: ${errors} error(s), ${warnings} warning(s)."
if [ "$errors" -gt 0 ]; then
  exit 1
fi
