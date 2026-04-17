---
type: session
status: active
area: dashboard
date: 2026-04-15
source_files:
  - trading_bot/dashboard/components/discovery-lab-results-board.tsx
  - trading_bot/dashboard/components/discovery-lab-client.tsx
  - trading_bot/backend/src/services/discovery-lab-manual-entry.ts
  - trading_bot/backend/src/engine/execution-engine.ts
  - trading_bot/backend/src/services/discovery-lab-service.ts
  - trading_bot/backend/src/services/discovery-lab-workspace-packs.ts
  - trading_bot/backend/src/services/discovery-lab-created-packs.ts
  - notes/reference/dashboard-operator-ui.md
  - notes/reference/api-surface.md
  - notes/reference/strategy.md
graph_checked: 2026-04-15
next_action: Browser-verify the slimmer pack-test workflow against a real completed run so the new quick-run cards, trade-ready shortlist, and reduced action bar are checked outside build-only validation.
---

# Session - Discovery Lab Trade Ticket And Pack Favorites

## Findings / Decisions

- The old discovery-lab manual entry flow still depended on `window.confirm`, which was too thin for a safety-critical trade action and left no room to customize final ticket size or exits.
- The existing full-view token review had the right data, but it still scanned like one large drawer rather than a review surface with a clear setup -> risk -> structure -> watchouts order.
- The old token link helper only opened a generic Axiom pulse page and the backend manual-entry bridge was dropping `positionSizeUsd` and exit overrides before they reached the manual-entry service.
- The results board did not know about currently open positions by mint, so the operator could not see duplicate exposure directly from the run results.
- Favorite packs are operator-local preference, not backend state. Local storage is the right fit for the discovery-lab UI shortcut layer.
- Workspace packs should stay `custom` in the catalog so they behave like editable local drafts, even when the repo seeds them automatically. The retained `Scalp tape + structure` pack belongs in that same workspace library alongside the three new repo-seeded workspace packs.
- Pack optimization has to cover the strategy ladder inside each pack, not just the outer threshold overrides. Otherwise the UI shows a new thesis with stale recipe ranges underneath it.
- A dedicated recent-graduate 2x lane needs its own created pack. Folding that requirement into `fresh-burst` would blur the difference between broad early continuation recall and selective 2x-first hunting.
- The graduated 2x hunt now also needs market-cap category ownership. Under-5k and 5k-10k tokens should not share one threshold shell with 25k-plus names when the upside and risk profile are structurally different.
- Recent-run evidence now favors early-graduated scalp packs over the broader high-value category packs. The latest run summary showed winners for `scalp-tape-structure`, while the recent inline category-pack tests returned zero winners.
- The results-route `Run` action was still using the current draft editor state instead of the selected completed run snapshot. That let an unrelated invalid draft surface `draft pack is invalid` on `/discovery-lab/results` even while a completed run was open.
- The strategy-lab client had drifted into too many always-visible controls. Running, reopening, live staging, logs, and trade handoff were all competing in one tall results stack, while the builder action bar exposed every pack mutation all the time.

## What Changed

- `discovery-lab-results-board.tsx` now opens a full-screen trade ticket from `Trade ticket` instead of executing directly. The ticket exposes editable size and exit settings, resets back to calibrated values, and submits the operator choices through the existing manual-entry route.
- `discovery-lab-results-board.tsx` now tracks open positions by mint, marks them inline in the AG Grid and mobile cards, blocks duplicate manual entries, and links directly into the open position detail when the mint is already live.
- The token full-view modal now adds provider-backed project links, socials, creator context, market pulse, and security posture on top of the existing setup, EV/risk, structure, timing, and watchout sections.
- Result-row external links now use the mint-specific Axiom meme route and add Rugcheck plus Solscan pivots instead of only generic Axiom plus DexScreener.
- `discovery-lab-manual-entry.ts` and `execution-engine.ts` now accept manual-entry size and exit overrides, validate them, and still route the entry through normal risk capacity and managed-exit persistence.
- `runtime.ts`, `server.ts`, `birdeye-client.ts`, and the new `discovery-lab-token-insight-service.ts` now expose `/api/operator/discovery-lab/token-insight?mint=` so the dashboard can hydrate socials, creator/tool links, market, and security data live per selected result row.
- `discovery-lab-token-insight-service.ts` now treats missing provider numbers as missing data instead of coercing `null` into `0`, so the review modal does not show fake zero values for absent market fields.
- `discovery-lab-service.ts` now seeds the workspace pack catalog with the retained legacy scalp pack plus three editable workspace packs when they do not already exist:
  - `Scalp tape + structure`
  - `Workspace - Micro Burst Probe`
  - `Workspace - Structured Trend Ramp`
  - `Workspace - Late Migration Pressure`
- The repo-seeded discovery-lab packs were later re-laddered so the non-control packs spread across micro-scalp, fresh burst, structured trend, late quality, and late migration bands; `Scalp tape + structure` stayed fixed and `created-late-expansion-quality` now defaults to `high-value`.
- The non-control pack strategy ladders were then refreshed to match those new pack bands. Recipe windows, band labels, and query params now step more deliberately through each pack’s intended PnL range instead of leaving the older recipe ladder under the new threshold shell.
- `workspace-late-migration-pressure` no longer ships pregrad recipes that exceed Birdeye’s 5-filter ceiling. The late-migration ladder now keeps its late-curve progress bands while staying provider-valid by dropping the extra created-time filter pressure.
- `discovery-lab-created-packs.ts` now also includes `created-just-graduated-2x-ladder`, a high-value pump-only recent-graduate pack tuned for the first 6 to 42 minutes after graduation with internal recipe bands centered on 100% to 260% continuation outcomes.
- `discovery-lab-created-packs.ts` now also includes five graduated market-cap category packs with explicit 2x-first payout ladders and cap-band-specific security thresholds:
  - `created-grad-mcap-sub5k-moonshot` (`2x-10x`, max cap `5k`)
  - `created-grad-mcap-5k-10k-core` (`2x-5x`, `5k-10k`)
  - `created-grad-mcap-10k-25k-structured` (`2x-4x`, `10k-25k`)
  - `created-grad-mcap-25k-50k-quality` (`2x-3x`, `25k-50k`)
  - `created-grad-mcap-50k-100k-extension` (`2x-2.5x`, `50k-100k`)
- `discovery-lab-created-packs.ts` was then pivoted to a scalp-only created set with five early-graduated strategies, and the non-winning non-scalp created packs were removed from the default created catalog:
  - `created-early-grad-scalp-tape-surge`
  - `created-early-grad-scalp-buyer-stack`
  - `created-early-grad-scalp-liquidity-ramp`
  - `created-early-grad-scalp-momentum-retest`
  - `created-early-grad-scalp-quality-guard`
- Those five early scalp packs were then retuned to favor lower-cap fast movers by tightening pack-level market-cap ceilings and adding recipe-level `max_market_cap` ladders (from `220k` up to `1.2m`) while keeping all recipes inside Birdeye’s 5-filter cap.
- A follow-up lab pass found the real Birdeye filter contract in practice: `source + graduated + 4 other filters` fails with `Maximum 5 concurrently filters`. The created scalp packs were corrected to 4 recipe filters (`graduated`, `min_graduated_time`, `max_market_cap`, `min_trade_5m_count`) so pump-scoped runs stay provider-valid.
- The created scalp thresholds were retuned again with pack-specific guardrail ladders (buy/sell ratio, top10 concentration, largest-holder concentration, cap ladders) so early packs remain aggressive while later packs stay stricter.
- `scripts/discovery-lab/runner.ts` now applies the selected pack’s threshold overrides automatically in CLI pack mode so local filter experiments match real pack behavior instead of using profile-only defaults.
- Added `npm run lab:pack-bench` (`scripts/discovery-lab-pack-bench.ts`) to run the five created early scalp packs in one pass and print a compact winners/rejects summary for fast threshold iteration.
- Birdeye CU accounting was corrected for `/defi/token_overview` (30 CU) and mapped to the evaluation lane budget, and token insight responses now use a short in-memory cache to avoid repeat provider spends from repeated panel opens.
- `discovery-lab-client.tsx` now supports favorite packs with local storage, a favorites group in the library selector, a quick favorite toggle, and favorite chips for faster pack switching.
- `discovery-lab-client.tsx` now re-runs the selected completed run snapshot from the results route instead of reusing the current working draft, and opening a run clears stale draft-error banners before the results surface renders.
- `discovery-lab-client.tsx` now favors a slimmer operator loop:
  - studio keeps `Save package` and `Run` as the primary always-visible actions, while `New`, `Clone`, `Delete`, and `Validate` move under a quieter `More tools` disclosure
  - results now use one `Pack test workflow` panel that combines pack-under-test context, current review target, live run progress, and recent-run reopen cards instead of separate run center and side-rail surfaces
  - saved packs now run by `packId` when the draft is unchanged, so the common test path is lighter than re-posting the full draft body each time
- `discovery-lab-results-board.tsx` now surfaces a compact `Trade-ready now` shortlist above the token board so the best manual-entry candidates are visible before the operator starts drilling through the table.
- Discovery-lab copy was shortened across the header, run workflow, outputs, and results board so the surface reads as an operator tool instead of a guided explainer.

## What I Verified

- `cd trading_bot/dashboard && npm run build`
- `cd trading_bot/backend && npm run build`
- `curl http://localhost:3101/api/operator/discovery-lab/token-insight?mint=...` after the compose refresh, including the sample Axiom mint plus a known token with live socials
- `cd trading_bot/backend && npm run lab:pack-bench -- --sources pump_dot_fun --cache-ttl-seconds 0 --query-concurrency 2 --deep-concurrency 3`
- `cd trading_bot/dashboard && npm run build` after wiring the results-route rerun path to the selected run snapshot
- `cd trading_bot/dashboard && npm run build` after collapsing the results workflow into the new pack-test panel and trade-ready shortlist

## Remaining Risks

- The new workspace packs are seeded at backend-service startup, so a running backend needs a restart before the packs appear in the live catalog.
- The trade-ticket defaults, shortlist, and revised results workflow are build-verified, but the live operator feel still needs a browser pass against a completed run and a live token insight response.
