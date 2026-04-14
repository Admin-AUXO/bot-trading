#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
default_env_path="${repo_root}/backend/.env"

env_path="${default_env_path}"
sync_env=1
build_only=0
force_recreate=1
full_stack=0
services_explicit=0

declare -a profiles=()
declare -a services=()

append_unique() {
  local value="$1"
  shift
  local existing
  for existing in "$@"; do
    if [[ "${existing}" == "${value}" ]]; then
      return 0
    fi
  done
  return 1
}

add_profile() {
  local profile="$1"
  if [[ ${#profiles[@]} -eq 0 ]]; then
    profiles+=("${profile}")
    return
  fi
  if ! append_unique "${profile}" "${profiles[@]}"; then
    profiles+=("${profile}")
  fi
}

add_service() {
  local service="$1"
  if [[ ${#services[@]} -eq 0 ]]; then
    services+=("${service}")
    return
  fi
  if ! append_unique "${service}" "${services[@]}"; then
    services+=("${service}")
  fi
}

usage() {
  cat <<'EOF'
Usage: ./scripts/update-compose-stack.sh [options]

Refresh the repo's Docker Compose services in a repeatable way:
1. sync compose env files from backend/.env
2. validate docker compose config
3. rebuild buildable services
4. recreate the requested containers

Default services:
  db-setup bot dashboard

Options:
  --env PATH               Use a different backend env file for compose env sync.
  --skip-env-sync          Skip node ./scripts/sync-compose-env.mjs.
  --build-only             Build requested services but do not run docker compose up.
  --no-force-recreate      Use docker compose up without --force-recreate.
  --full-stack             Also refresh grafana with the default app services.
  --include-automation     Include the n8n sidecar and enable the automation profile.
  --include-notes          Include the Obsidian sidecar and enable the notes profile.
  --service NAME           Refresh only the named service. Repeat as needed.
  --help                   Show this message.

Examples:
  ./scripts/update-compose-stack.sh
  ./scripts/update-compose-stack.sh --service dashboard
  ./scripts/update-compose-stack.sh --service bot --service dashboard
  ./scripts/update-compose-stack.sh --full-stack
  ./scripts/update-compose-stack.sh --include-automation --service n8n
  ./scripts/update-compose-stack.sh --include-notes --service obsidian
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      if [[ $# -lt 2 ]]; then
        echo "[compose-refresh] --env requires a path" >&2
        exit 1
      fi
      env_path="$2"
      shift 2
      ;;
    --skip-env-sync)
      sync_env=0
      shift
      ;;
    --build-only)
      build_only=1
      shift
      ;;
    --no-force-recreate)
      force_recreate=0
      shift
      ;;
    --full-stack)
      full_stack=1
      shift
      ;;
    --include-automation)
      add_profile "automation"
      add_service "n8n"
      shift
      ;;
    --include-notes)
      add_profile "notes"
      add_service "obsidian"
      shift
      ;;
    --service)
      if [[ $# -lt 2 ]]; then
        echo "[compose-refresh] --service requires a compose service name" >&2
        exit 1
      fi
      services_explicit=1
      add_service "$2"
      case "$2" in
        n8n)
          add_profile "automation"
          ;;
        obsidian)
          add_profile "notes"
          ;;
      esac
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "[compose-refresh] Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "${env_path}" != /* ]]; then
  env_path="${repo_root}/${env_path}"
fi

cd "${repo_root}"

if [[ ${services_explicit} -eq 0 ]]; then
  add_service "db-setup"
  add_service "bot"
  add_service "dashboard"
fi

if [[ ${full_stack} -eq 1 ]]; then
  add_service "grafana"
fi

compose_cmd=(docker compose)
if [[ ${#profiles[@]} -gt 0 ]]; then
  for profile in "${profiles[@]}"; do
    compose_cmd+=(--profile "${profile}")
  done
fi

buildable_services=()
for service in "${services[@]}"; do
  case "${service}" in
    db-setup|bot|dashboard)
      buildable_services+=("${service}")
      ;;
  esac
done

echo "[compose-refresh] Repo root: ${repo_root}"
echo "[compose-refresh] Env source: ${env_path}"
echo "[compose-refresh] Services: ${services[*]}"
if [[ ${#profiles[@]} -gt 0 ]]; then
  echo "[compose-refresh] Profiles: ${profiles[*]}"
fi

if [[ ${sync_env} -eq 1 ]]; then
  echo "[compose-refresh] Syncing compose env files"
  node ./scripts/sync-compose-env.mjs "${env_path}"
else
  echo "[compose-refresh] Skipping compose env sync"
fi

echo "[compose-refresh] Validating compose config"
"${compose_cmd[@]}" config >/dev/null

if [[ ${#buildable_services[@]} -gt 0 ]]; then
  echo "[compose-refresh] Building: ${buildable_services[*]}"
  "${compose_cmd[@]}" build "${buildable_services[@]}"
else
  echo "[compose-refresh] No build step needed for requested services"
fi

if [[ ${build_only} -eq 1 ]]; then
  echo "[compose-refresh] Build-only mode finished"
  exit 0
fi

up_args=(up -d)
if [[ ${force_recreate} -eq 1 ]]; then
  up_args+=(--force-recreate)
fi

echo "[compose-refresh] Recreating services"
"${compose_cmd[@]}" "${up_args[@]}" "${services[@]}"

echo "[compose-refresh] Current status"
"${compose_cmd[@]}" ps "${services[@]}"
