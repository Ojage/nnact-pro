#!/usr/bin/env bash
# Start the production deploy detached on this host so a dropped SSH
# connection cannot abort the long build. Used by GitHub Actions.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Kill any stale deploy from a previous run. The bracket-quote avoids the
# pattern matching this script's own command line.
pkill -f 'ci-deploy[.]sh' || true

rm -f /tmp/ci-deploy.exit
: > /tmp/ci-deploy.log

nohup bash -c "cd '${ROOT}' && MARKETING_SKIP_BUILD=true bash scripts/ci-deploy.sh > /tmp/ci-deploy.log 2>&1; echo \$? > /tmp/ci-deploy.exit" >/dev/null 2>&1 &

echo "deploy started pid $!"