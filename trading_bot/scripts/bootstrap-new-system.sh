#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-host}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

warn_placeholder_env() {
  if [[ ! -f "$ROOT_DIR/backend/.env" ]]; then
    return
  fi

  if has_cmd rg; then
    if ! rg -n 'replace-me|postgres:5432' "$ROOT_DIR/backend/.env" >/dev/null 2>&1; then
      return
    fi
  elif ! grep -Eq 'replace-me|postgres:5432' "$ROOT_DIR/backend/.env"; then
    return
  fi

  cat <<'EOF'

backend/.env still contains example values.
Fill the provider keys before expecting the bot to work properly.
EOF
}

print_next_steps() {
  case "$MODE" in
    host)
      cat <<'EOF'

Next steps for host-run app + Docker Postgres:
1. Edit trading_bot/backend/.env
2. Change DATABASE_URL host from postgres to 127.0.0.1 or localhost
3. Start Postgres:
   cd trading_bot && docker compose up -d postgres
4. Set up backend:
   cd trading_bot/backend && npm run db:generate && npm run db:setup && npm run dev
5. Start dashboard:
   cd trading_bot/dashboard && npm run dev
EOF
      ;;
    compose)
      cat <<'EOF'

Next steps for full Compose stack:
1. Edit trading_bot/backend/.env
2. Keep DATABASE_URL pointed at postgres
3. Generate service env files:
   cd trading_bot && ./scripts/sync-compose-env.sh
4. Start the stack:
   cd trading_bot && docker compose up --build
EOF
      ;;
  esac
}

case "$MODE" in
  host|compose) ;;
  *)
    echo "Usage: ./scripts/bootstrap-new-system.sh [host|compose]" >&2
    exit 1
    ;;
esac

require_cmd node
require_cmd npm
require_cmd docker

echo "Using Node $(node -v) and npm $(npm -v)"
echo "Installing backend dependencies..."
(cd "$ROOT_DIR/backend" && npm ci)

echo "Installing dashboard dependencies..."
(cd "$ROOT_DIR/dashboard" && npm ci)

if [[ ! -f "$ROOT_DIR/backend/.env" ]]; then
  cp "$ROOT_DIR/backend/.env.example" "$ROOT_DIR/backend/.env"
  echo "Created trading_bot/backend/.env from example"
fi

if [[ "$MODE" == "compose" ]]; then
  if [[ ! -x "$ROOT_DIR/scripts/sync-compose-env.sh" ]]; then
    chmod +x "$ROOT_DIR/scripts/sync-compose-env.sh"
  fi
  if [[ -f "$ROOT_DIR/backend/.env" ]]; then
    "$ROOT_DIR/scripts/sync-compose-env.sh"
  fi
fi

warn_placeholder_env
print_next_steps
