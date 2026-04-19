#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/trading_bot/backend/.env"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

# Avoid Anthropic-compatible overrides hijacking the MiniMax provider selection.
unset ANTHROPIC_AUTH_TOKEN
unset ANTHROPIC_BASE_URL

cd "$ROOT"
exec opencode "$@"
