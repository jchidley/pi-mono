#!/usr/bin/env bash
# Prepare a release update without changing the live checkout.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
node scripts/update-pi.mjs "$@"
