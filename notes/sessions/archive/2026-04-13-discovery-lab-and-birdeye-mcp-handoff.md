---
type: session
status: active
area: providers/research
date: 2026-04-13
source_files:
  - trading_bot/backend/scripts/discovery-lab.ts
  - trading_bot/backend/src/services/discovery-lab-service.ts
  - trading_bot/dashboard/app/discovery-lab/page.tsx
  - trading_bot/dashboard/components/discovery-lab-client.tsx
  - trading_bot/backend/scripts/discovery-lab.recipes.json
  - .codex/scripts/start-birdeye-mcp.cjs
  - notes/investigations/2026-04-11-birdeye-discovery-lab-quality-pack-sweep.md
  - notes/investigations/2026-04-11-mcp-surface-audit.md
  - notes/runbooks/2026-04-11-birdeye-discovery-lab.md
graph_checked: 2026-04-13
next_action: Re-run the exact scalp pack in another live window to confirm the looser holder thresholds are not overfitting one hot tape, then finish a direct shell-side Birdeye MCP probe from a fresh top-level Codex session.
---

# Session - Discovery Lab And Birdeye MCP Handoff

## Findings / Decisions

- Discovery lab now defaults to `pump_dot_fun`, writes a winners CSV beside the JSON report, and exports the explicit holder column `top10_holder_percent`.
- Helius mint authority and holder concentration are now fetched once per unique uncached mint across the whole run and reused across recipe winners.
- The default recipe pack is now a small-ticket pump blend:
  `grad_10m_last_trade`
  `grad_10m_graduated_time`
  `grad_30m_volume5m`
  `grad_45m_live_tape`
  `grad_60m_trade5m`
- A fresh sub-10m pump run returned `0` names, and direct Birdeye probes also showed `0` pump graduates in the last `10m`, `12m`, `15m`, and `20m`. That was real market silence, not a broken `max_graduated_time` filter.
- The interrupted threshold-calibration artifact still landed and is useful: a balanced small-ticket proxy lens on `grad_30m_volume5m`, `grad_45m_live_tape`, and `grad_60m_trade5m` produced `5` pass-grade names. That is the best current starting point for a future scalp profile:
  `minLiquidityUsd=8000`
  `maxMarketCapUsd=2000000`
  `minHolders=35`
  `minVolume5mUsd=1500`
  `minUniqueBuyers5m=12`
  `minBuySellRatio=1.05`
  `maxTop10HolderPercent=45`
  `maxSingleHolderPercent=25`
  `maxNegativePriceChange5mPercent=18`
- Birdeye MCP local opt-in is only half-validated in this session:
  the live config was flipped on
  `codex -c mcp_servers.birdeye-mcp.enabled=true mcp get birdeye-mcp` showed the stdio config
  a fresh nested `codex exec` saw the `birdeye-mcp/get-defi-v3-token-meme-list` tool name
  but the actual nested tool call failed twice with `user cancelled MCP tool call`
  and the nested agent reported `birdeye-mcp server is unavailable`
- A follow-up scalp-profile run on the tweaked default pack produced `18` pass-grade hits across `5` unique pump tokens:
  `grad_60m_trade5m` returned `5`
  `grad_45m_live_tape` returned `4`
  `grad_30m_volume5m` returned `3`
  `grad_10m_last_trade` returned `3`
  `grad_10m_graduated_time` returned `3`
- The dedicated scalp profile now exists in `discovery-lab.ts` and matches the proxy threshold set from the interrupted calibration artifact:
  `minLiquidityUsd=8000`
  `maxMarketCapUsd=2000000`
  `minHolders=35`
  `minVolume5mUsd=1500`
  `minUniqueBuyers5m=12`
  `minBuySellRatio=1.05`
  `maxTop10HolderPercent=45`
  `maxSingleHolderPercent=25`
  `maxNegativePriceChange5mPercent=18`
- The usable winners in the sampled window were:
  `Twig`
  `The Story Crypto Told First`
  `the great pardoning`
  `Bitcoin Bull`
  `Kusya`

## What Changed

- Updated `trading_bot/backend/scripts/discovery-lab.ts` to improve winner export and batch Helius enrichment.
- Replaced the default `trading_bot/backend/scripts/discovery-lab.recipes.json` with a small-ticket pump-first blend.
- Added a dedicated `scalp` grading profile to `trading_bot/backend/scripts/discovery-lab.ts`.
- Rebalanced the default `trading_bot/backend/scripts/discovery-lab.recipes.json` pack to keep two `10m` probes plus the `30m`, `45m`, and `60m` continuation recipes that produced pass-grade names in calibration.
- Fixed the default built-in pack naming so the dashboard no longer loads with a blank starter name and blocked action state.
- Reworked `trading_bot/dashboard/components/discovery-lab-client.tsx` into a more guided discovery-lab workbench with quick-start cards, explicit starter-pack actions, clearer editor status, stronger local validation, a recipe navigator, a run cockpit, and live stdout or stderr log panels.
- Added `trading_bot/dashboard/components/discovery-lab-results-board.tsx` and replaced the old generic evaluated-rows dump with a token-centric results surface using `@tanstack/react-table`, deduplicated token rows, overlap or dedupe stats, compact source or recipe leader summaries, and a quieter raw-hit disclosure.
- Updated the backend container runtime so discovery-lab runs launched from the dashboard actually work in Docker:
  moved `tsx` into production dependencies
  copied backend `src/` into the bot runner image
  and improved stderr-first failure summaries for lab run errors
- Hardened `trading_bot/backend/src/services/discovery-lab-service.ts` so run and pack JSON writes are atomic and corrupt run files no longer blank the entire recent-run catalog.
- Updated the discovery lab investigation, runbook, and MCP audit notes with the latest durable findings.
- Rebuilt Graphify after the code changes.

## What I Verified

- Smoke run with overlapping recipes confirmed the shared Helius batch path and merged winner CSV output.
- Fresh sub-10m run:
  `npm run lab:discovery -- --profile high-value --cache-ttl-seconds 0 --out ../../.codex/tmp/discovery-lab-sub10m-2026-04-13.json`
  returned `0` winners.
- Fresh scalp-profile rerun on the tweaked default pack:
  `npm run lab:discovery -- --profile scalp --cache-ttl-seconds 0 --out ../../.codex/tmp/discovery-lab-scalp-2026-04-13.json`
  returned `18` pass-grade hits across `5` unique tokens and wrote a winners CSV beside the JSON report.
- Direct Birdeye HTTP probes confirmed `0` raw pump graduates in the fresh windows at validation time.
- Balanced proxy calibration artifact exists and produced `5` winners:
  `.codex/tmp/discovery-lab-calib-balanced.json`
- Graphify rebuild completed:
  `graphify-out/graph.json`
  `graphify-out/GRAPH_REPORT.md`

## Remaining Risks

- The sub-10m pack still has no live winner evidence because the market window was empty.
- The looser scalp holder thresholds materially increased usable names in one window, but that may be a hot-tape artifact until it repeats in another session.
- Birdeye MCP tool execution was not revalidated end to end in this session; only discovery of the tool surface was confirmed under explicit override.

## UI Follow-Up

- The Next.js dashboard now has a dedicated `/discovery-lab` page.
- Built-in recipe packs stay read-only, but the page can clone them into local custom packs stored under `trading_bot/backend/.local/discovery-lab/packs/`.
- Discovery-lab runs now stay local under `trading_bot/backend/.local/discovery-lab/runs/`, with one active run at a time and recent history reloadable on the same page.
- The page launches the existing `npm run lab:discovery` CLI flow behind the backend API instead of reimplementing Birdeye or Helius grading logic in the browser.
- The editor now mirrors the settings page pattern more closely: pack basics, thresholds, and recipes are separate sections, recipes are navigable one at a time, and operators can load a selected run snapshot back into a new editable draft.
- A new run cockpit makes launch status obvious immediately, shows the exact CLI shape being triggered, polls the persisted run record, and surfaces live stdout or stderr so operators can track progress before the report lands.
- Discovery-lab timestamps are now hydration-safe in the Next.js page, which removes the React 418 mismatch that showed up during browser verification.
- The main result surface is now mint-centric instead of row-centric: repeated recipe hits collapse into one token row, overlap can be filtered explicitly, and the raw duplicated hit list is available behind a quieter secondary disclosure.
- Build verification passed for:
  `cd trading_bot/backend && npm run build`
  `cd trading_bot/dashboard && npm run build`
- Browser smoke verification against `http://127.0.0.1:3100/discovery-lab` passed for:
  starter clone
  pack-name edit
  validate
  save custom
  duplicate selected recipe
  launch run
- A focused browser pass also verified the token-board UI loads without console or page errors, and that token-board search, overlap filtering, raw-hit disclosure, starter cloning, pack-name edits, recipe duplication, validation, save, and run launch all still work on the live page.
- Direct operator run verification passed after the Docker runtime fix:
  `POST /api/operator/discovery-lab/run` with `packId=discovery-lab.recipes`
  completed with `5` queries, `12` evaluations, and `0` winners in the sampled window
- A later direct operator rerun on the current default pack completed with `5` queries, `9` evaluations, and `2` winners.
- The atomic-write or corrupt-run-file recovery fix was verified locally by instantiating the service against a temp workspace that contained one valid `.run.json` and one intentionally broken `.run.json`; `getCatalog()` still returned the valid recent run.
- A later bot-container refresh was blocked by Docker Desktop storage or overlay I/O failures, so the running `trading-bot` container could not be rebuilt with the atomic-write fix even though the backend code built successfully.
- `cd trading_bot/backend && npm run typecheck` is still not a clean repo gate because of pre-existing Prisma and implicit-any errors outside the discovery-lab surface.

## Durable Notes Updated

- `notes/investigations/2026-04-11-birdeye-discovery-lab-quality-pack-sweep.md`
- `notes/investigations/2026-04-11-mcp-surface-audit.md`
- `notes/runbooks/2026-04-11-birdeye-discovery-lab.md`
