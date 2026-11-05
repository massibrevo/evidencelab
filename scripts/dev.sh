#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -d web/node_modules ]]; then echo 'Run: cd web && npm ci'; exit 1; fi
if [[ -x .venv/bin/python ]]; then PYTHON=.venv/bin/python; else PYTHON=python3; fi
exec "$PYTHON" scripts/dev.py "$@"
