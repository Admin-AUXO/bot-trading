---
type: session
status: active
area: docker/runtime
date: 2026-04-12
source_files:
  - trading_bot/backend/.env
  - trading_bot/scripts/sync-compose-env.sh
  - trading_bot/dashboard/compose.env
  - trading_bot/docker-compose.yml
  - notes/reference/bootstrap-and-docker.md
graph_checked:
next_action: If dry runs fail again, inspect the live container env with docker inspect before trusting backend/.env on disk.
---

# Session - Compose Env And Dry Run Summary

## Findings / Decisions

- The live compose stack was serving stale placeholder secrets even though `trading_bot/backend/.env` held real provider credentials.
- The actual failure was env drift plus stale containers, not a broken dry-run route.
- `TRADE_MODE`, `BOT_PORT`, and `DASHBOARD_PORT` in `backend/.env` were also misaligned with the compose contract, so the env file itself was lying about how the active stack should run.

## What Changed

- Aligned `trading_bot/backend/.env` to the compose dry-run contract: `POSTGRES_PORT=56432`, `BOT_PORT=3101`, `DASHBOARD_PORT=3100`, `TRADE_MODE="DRY_RUN"`.
- Hardened `trading_bot/scripts/sync-compose-env.sh` so it strips carriage returns before sourcing `backend/.env`.
- Regenerated the compose-only env files and force-recreated `db-setup`, `bot`, and `dashboard` so the running containers picked up the corrected values.

## What I Verified

- `docker inspect trading-bot` now shows the real `BIRDEYE_API_KEY`, `HELIUS_RPC_URL`, `CONTROL_API_SECRET`, `TRADE_MODE=DRY_RUN`, and `BOT_PORT=3101`.
- `docker inspect trading-dashboard` now shows the synced `CONTROL_SECRET` and `API_URL=http://bot:3101`.
- `GET http://127.0.0.1:3101/health` returned `{"ok":true,"tradeMode":"DRY_RUN"}` after recreation.
- `POST /api/control/run-research-dry-run` succeeded after the env fix.
- Latest research run `cmnvxpkfd000007qqbwhmp6ho` completed with `birdeyeCalls=1`, `birdeyeUnitsUsed=100`, `heliusCalls=0`, `heliusUnitsUsed=0`, and no backend error.

## Remaining Risks

- Recent diagnostics still show the earlier two Birdeye `401` failures in the six-hour window because this task fixed the runtime path forward, not historical error counters.
- The successful run still discovered zero names, so the next problem is market yield or thresholds, not env wiring.

## Durable Notes Updated

- `notes/reference/bootstrap-and-docker.md`
