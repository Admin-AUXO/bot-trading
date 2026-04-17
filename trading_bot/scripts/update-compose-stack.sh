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
skip_build=0

# Arrays — initialize to empty to avoid set -u issues
profiles=()
services=()

usage() {
  cat <<'EOF'
Usage: ./scripts/update-compose-stack.sh [options]

Refresh the repo's Docker Compose services in a repeatable way:
  1. sync compose env files from backend/.env
  2. validate docker compose config
  3. rebuild only services whose source files changed (smart rebuild)
  4. recreate the requested containers

Default services: db-setup bot dashboard

Options:
  --env PATH          Use a different backend env file for compose env sync.
  --skip-env-sync     Skip the env-sync step.
  --skip-build        Skip the build step entirely (env-only or no-src-changes).
  --build-only        Build services but do not docker compose up.
  --no-force-recreate Use 'docker compose up' without --force-recreate.
  --full-stack        Also refresh grafana with the default app services.
  --service NAME      Refresh only the named service. Repeat as needed.
  --help              Show this message.

Examples:
  ./scripts/update-compose-stack.sh                           # normal full refresh
  ./scripts/update-compose-stack.sh --skip-build             # fast env-only change
  ./scripts/update-compose-stack.sh --service dashboard      # single service (smart rebuild)
  ./scripts/update-compose-stack.sh --service bot --skip-build  # backend env change
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      env_path="$2"; shift 2 ;;
    --skip-env-sync) sync_env=0; shift ;;
    --skip-build)    skip_build=1; shift ;;
    --build-only)    build_only=1; shift ;;
    --no-force-recreate) force_recreate=0; shift ;;
    --full-stack)    full_stack=1; shift ;;
    --service)
      services_explicit=1
      services+=("$2")
      [[ "$2" == "n8n" ]] && profiles+=("automation")
      [[ "$2" == "obsidian" ]] && profiles+=("notes")
      shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "[compose-refresh] Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

[[ "${env_path}" != /* ]] && env_path="${repo_root}/${env_path}"

cd "${repo_root}"

# Default services
[[ ${services_explicit} -eq 0 ]] && services=(db-setup bot dashboard)
[[ ${full_stack} -eq 1 ]] && services+=(grafana)

echo "[compose-refresh] Repo root : ${repo_root}"
echo "[compose-refresh] Env source: ${env_path}"
echo "[compose-refresh] Services  : ${services[*]}"

# ---------------------------------------------------------------------------
# 1. Env sync
# ---------------------------------------------------------------------------
if [[ ${sync_env} -eq 1 ]]; then
  echo "[compose-refresh] Syncing compose env files"
  node ./scripts/sync-compose-env.mjs "${env_path}"
else
  echo "[compose-refresh] Skipping env sync"
fi

# ---------------------------------------------------------------------------
# 2. Config validation
# ---------------------------------------------------------------------------
echo "[compose-refresh] Validating compose config"
compose_cmd=(docker compose)
[[ ${#profiles[@]} -gt 0 ]] && for p in "${profiles[@]}"; do compose_cmd+=(--profile "$p"); done
"${compose_cmd[@]}" config >/dev/null

# ---------------------------------------------------------------------------
# 3. Smart rebuild — only rebuild services whose source files changed
# ---------------------------------------------------------------------------
if [[ ${skip_build} -eq 1 ]]; then
  echo "[compose-refresh] Skipping build (--skip-build)"

elif [[ ${#services[@]} -gt 0 ]]; then
  needs_rebuild=()
  touch_marker="${repo_root}/.docker-mtime"
  marker_exists=0
  [[ -f "${touch_marker}" ]] && marker_exists=1

  for service in "${services[@]}"; do
    case "${service}" in
      dashboard)
        if [[ ${marker_exists} -eq 0 ]]; then
          needs_rebuild+=("${service}")
        elif find \
               "${repo_root}/dashboard/app" \
               "${repo_root}/dashboard/components" \
               "${repo_root}/dashboard/lib" \
               "${repo_root}/dashboard/public" \
               "${repo_root}/dashboard/scripts" \
               "${repo_root}/dashboard/package.json" \
               "${repo_root}/dashboard/package-lock.json" \
               "${repo_root}/dashboard/tsconfig.json" \
               "${repo_root}/dashboard/postcss.config.mjs" \
               -type f -newer "${touch_marker}" 2>/dev/null | grep -q .; then
          needs_rebuild+=("${service}")
        else
          echo "[compose-refresh] ${service}: no dashboard build-input changes, skipping rebuild"
        fi
        ;;
      bot)
        if [[ ${marker_exists} -eq 0 ]]; then
          needs_rebuild+=("${service}")
        elif find "${repo_root}/backend/src" "${repo_root}/backend/prisma" "${repo_root}/backend/scripts" \
               "${repo_root}/backend/package.json" \
               "${repo_root}/backend/package-lock.json" \
               -type f -newer "${touch_marker}" 2>/dev/null | grep -q .; then
          needs_rebuild+=("${service}")
        else
          echo "[compose-refresh] ${service}: no backend build-input changes, skipping rebuild"
        fi
        ;;
      db-setup)
        if [[ ${marker_exists} -eq 0 ]]; then
          needs_rebuild+=("${service}")
        elif find "${repo_root}/backend/prisma" \
               -type f -newer "${touch_marker}" 2>/dev/null | grep -q .; then
          needs_rebuild+=("${service}")
        else
          echo "[compose-refresh] ${service}: no src changes, skipping rebuild"
        fi
        ;;
    esac
  done

  if [[ ${#needs_rebuild[@]} -gt 0 ]]; then
    echo "[compose-refresh] Building: ${needs_rebuild[*]}"
    "${compose_cmd[@]}" build "${needs_rebuild[@]}"
    # Stamp so next run skips rebuild if nothing changed
    touch "${touch_marker}"
  else
    echo "[compose-refresh] No services need rebuilding"
  fi
fi

[[ ${build_only} -eq 1 ]] && echo "[compose-refresh] Build-only finished" && exit 0

# ---------------------------------------------------------------------------
# 4. Recreate / restart services
# ---------------------------------------------------------------------------
up_args=(up -d)
[[ ${force_recreate} -eq 1 ]] && up_args+=(--force-recreate)

echo "[compose-refresh] Bringing up: ${services[*]}"
"${compose_cmd[@]}" "${up_args[@]}" "${services[@]}"

echo "[compose-refresh] Current status"
"${compose_cmd[@]}" ps "${services[@]}"
