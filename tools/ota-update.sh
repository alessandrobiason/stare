#!/usr/bin/env bash
# Start the gated GitHub pipeline instead of publishing directly from this machine.
# Usage: ./tools/ota-update.sh "what changed" [EAS branch] [Git branch or tag]
set -euo pipefail
message="${1:-}"
ota_branch="${2:-production}"
if [ -z "${message//[[:space:]]/}" ]; then
  echo "usage: $0 \"what changed\" [EAS branch] [Git branch or tag]" >&2
  exit 1
fi
cd "$(dirname "$0")/.."
ref="${3:-$(git symbolic-ref --short HEAD)}"
if [ -n "$(git status --porcelain)" ]; then
  echo "Commit and push your changes first; the pipeline validates the remote ref." >&2
  exit 1
fi
gh workflow run pipeline.yml --ref "$ref" \
  -f operation=ota -f ota_branch="$ota_branch" -f message="$message"
echo "Requested OTA publishing from $ref. Check and App Store screenshots must pass first."
