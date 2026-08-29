#!/usr/bin/env bash
# Report the state of the detached production deploy. Used by GitHub Actions.
set -uo pipefail

if pgrep -f 'ci-deploy[.]sh' >/dev/null 2>&1; then
  echo RUNNING
  exit 0
fi

cat /tmp/ci-deploy.log 2>/dev/null || true

if [ -f /tmp/ci-deploy.exit ]; then
  echo "EXIT_CODE=$(cat /tmp/ci-deploy.exit)"
  exit 0
fi

echo STOPPED_WITHOUT_EXIT
exit 1