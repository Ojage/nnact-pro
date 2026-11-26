#!/usr/bin/env bash
# Thin wrapper: run the services CLI with Node's built-in TypeScript support.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node --disable-warning=ExperimentalWarning "$here/src/cli.ts" "$@"
