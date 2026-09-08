#!/usr/bin/env bash
#
# Publishes a JavaScript-only update from this machine -- the same steps
# .github/workflows/ota-update.yml runs on a Linux Actions runner. Nothing
# here needs a Mac: OTA is pure Node/Linux work, unlike the two iOS workflows.
#
# Usage:
#   ./tools/ota-update.sh "what this update changes" [branch]
#
#   branch defaults to "main", the branch we're updating.
#
# One-time setup: either `npx eas-cli login`, or export EXPO_TOKEN with an
# access token from expo.dev -> account settings -> access tokens -- the same
# kind of token used for the EXPO_TOKEN repository secret.
#
# See "Shipping a fix without a rebuild" in docs/ios-builds.md.

set -euo pipefail

message="${1:-}"
branch="${2:-main}"

if [ -z "$message" ]; then
  echo "usage: $0 \"what this update changes\" [branch]" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

if ! npx eas-cli@latest whoami >/dev/null 2>&1; then
  echo "Not logged in to Expo and no usable EXPO_TOKEN." >&2
  echo "Run 'npx eas-cli login', or export EXPO_TOKEN (expo.dev -> account settings -> access tokens)." >&2
  exit 1
fi

# An update goes straight onto a phone with no review and no chance to catch
# it in between, so the whole suite runs first, same as the CI gate.
echo "== Typecheck, lint and test =="
npm run check

echo
echo "== Check update configuration =="
node tools/check-eas-updates.mjs

echo
echo "== Runtime version =="
runtime="$(npx expo-updates runtimeversion:resolve --platform ios \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).runtimeVersion')"
echo "Publishing to branch \"$branch\" at runtime version $runtime."
echo "Only a build whose runtime version matches will be offered this update."

echo
echo "== Publish =="
npx eas-cli@latest update \
  --branch "$branch" \
  --message "$message" \
  --platform ios \
  --environment "$branch" \
  --non-interactive

echo
echo "Published. The app checks on launch and applies what it downloaded on"
echo "the next one, so a phone takes the update at the second launch after this."
