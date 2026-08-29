#!/usr/bin/env bash
# CORS origin reconciliation for production deploys.
#
# The API must answer cross-origin requests from every served marketing domain,
# but .env is (re)written from the NNACT_PRO_ENV secret on every CI deploy, so a
# CORS_ORIGIN that is missing a marketing origin silently reverts on the next
# release. This helper is sourced after `source .env` by deploy.sh and
# ci-deploy.sh; calling `reconcile_cors` guarantees CORS_ORIGIN always includes
# https://<NNPMARKETING_ADDRESS> and https://<NNPMARKETING_WWW>:
#
#   export CORS_ORIGIN=<merged value>   # used by `docker compose up` this run
#   and persists the merged value to .env, so manual restarts and post-deploy
#   checks observe the same value.
#
# Best-effort: if .env is not writable, the in-memory value is still exported and
# a warning is printed.

reconcile_cors() {
  local required=()
  local merged="${CORS_ORIGIN:-}"
  local domain origin

  for domain in "${NNPMARKETING_ADDRESS:-}" "${NNPMARKETING_WWW:-}"; do
    [ -n "$domain" ] || continue
    origin="https://${domain}"
    # Skip duplicates (e.g. WWW equal to the apex) and anything already present.
    case ",${merged}," in *",${origin},"*) continue ;; esac
    case " ${required[*]} " in *" ${origin} "*) continue ;; esac
    required+=("$origin")
  done

  if [ "${#required[@]}" -gt 0 ]; then
    merged="${merged%,}"
    for origin in "${required[@]}"; do
      merged="${merged},${origin}"
    done
    merged="${merged#,}"
  fi

  if [ "${merged}" != "${CORS_ORIGIN:-}" ]; then
    echo "CORS reconciliation: added marketing origins -> CORS_ORIGIN=${merged}" >&2
  fi
  CORS_ORIGIN="${merged}"
  export CORS_ORIGIN

  if [ -f .env ]; then
    if { ! [ -w .env ] || ! sed -i "s|^CORS_ORIGIN=.*|CORS_ORIGIN=${merged}|" .env; } 2>/dev/null; then
      echo "Warning: could not persist reconciled CORS_ORIGIN to .env (read-only?)." >&2
    fi
  fi
}

# Verify the live API echoes CORS_ACL for every served marketing origin. Called
# at the end of a successful deploy so a regression fails the release loudly.
verify_cors() {
  : "${NNPAPI_ADDRESS:?NNPAPI_ADDRESS is required to verify CORS}"
  : "${NNPMARKETING_ADDRESS:?NNPMARKETING_ADDRESS is required to verify CORS}"
  local origins=("https://${NNPMARKETING_ADDRESS}")
  if [ -n "${NNPMARKETING_WWW:-}" ] && [ "${NNPMARKETING_WWW}" != "${NNPMARKETING_ADDRESS}" ]; then
    origins+=("https://${NNPMARKETING_WWW}")
  fi
  local origin got failed=0
  for origin in "${origins[@]}"; do
    got="$(curl -s -D - -o /dev/null --max-time 20 \
      -H "Origin: ${origin}" \
      "https://${NNPAPI_ADDRESS}/api/public/marketing" 2>/dev/null \
      | tr -d '\r' | grep -i '^access-control-allow-origin:' | head -1 | cut -d' ' -f2- || true)"
    if [ "$got" = "$origin" ]; then
      echo "CORS OK: ${origin}"
    else
      echo "CORS check FAILED for ${origin}: server echoed '${got}' (expected ${origin})" >&2
      failed=1
    fi
  done
  return "$failed"
}