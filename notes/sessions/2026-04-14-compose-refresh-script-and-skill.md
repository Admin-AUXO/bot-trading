---
type: session
status: active
area: docker/runtime
date: 2026-04-14
source_files:
  - trading_bot/scripts/update-compose-stack.sh
  - .agents/skills/compose-stack-refresh/SKILL.md
  - notes/reference/bootstrap-and-docker.md
  - README.md
graph_checked:
next_action: If compose refresh needs finer-grained waiting or log capture later, extend the helper without widening the default service set beyond the core app chain.
---

# Session - Compose Refresh Script And Skill

## Findings / Decisions

- The repo had the raw commands for compose refresh, but no single supported helper for the common sync-build-recreate path.
- The repeated failure mode in recent compose work was stale container env after `backend/.env` changed, so the helper needed env sync and force recreation by default.
- The safest default refresh scope is the core app chain: `db-setup`, `bot`, and `dashboard`.

## What Changed

- Added `trading_bot/scripts/update-compose-stack.sh` to sync compose env files, validate compose config, rebuild buildable services, and recreate the requested containers.
- Added the repo-local skill `.agents/skills/compose-stack-refresh/SKILL.md` so future agents use the helper instead of retyping the flow.
- Updated `notes/reference/bootstrap-and-docker.md` and `README.md` to point to the helper as the supported fast refresh path.

## What I Verified

- `cd trading_bot && ./scripts/update-compose-stack.sh`
- `cd trading_bot && docker compose ps bot dashboard`
- `curl -sf http://127.0.0.1:3101/health`
- `curl -I -sf http://127.0.0.1:3100`

## Remaining Risks

- The helper relies on the local Docker Compose CLI surface; if the machine has an unusually old Compose version, behavior should be rechecked before adding newer flags or assumptions.
