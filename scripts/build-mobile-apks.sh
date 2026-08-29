#!/usr/bin/env bash
set -euo pipefail

profile="${1:-apk}"

case "$profile" in
  apk)  eas_profile="preview" ;;
  store) eas_profile="production" ;;
  *) echo "usage: $0 [apk|store]" >&2; exit 1 ;;
esac

for app in "@nnact/mobile" "@nnact/customer-mobile"; do
  echo "==> Building Android ($eas_profile) for $app"
  pnpm --filter "$app" exec eas build --platform android --profile "$eas_profile"
done

echo "Done. Download links are printed by eas once each build finishes."