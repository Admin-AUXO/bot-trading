---
type: session
status: closed
area: dashboard/performance
date: 2026-04-11
source_files:
  - trading_bot/dashboard/app/candidates/page.tsx
  - trading_bot/dashboard/app/candidates/[id]/page.tsx
  - trading_bot/dashboard/app/positions/page.tsx
  - trading_bot/dashboard/app/positions/[id]/page.tsx
  - trading_bot/dashboard/components/app-shell.tsx
  - trading_bot/dashboard/components/dashboard-client.tsx
  - trading_bot/dashboard/components/pinned-items.tsx
  - trading_bot/dashboard/components/workbench-row-actions.tsx
  - trading_bot/dashboard/lib/api.ts
  - trading_bot/dashboard/lib/format.ts
  - notes/reference/dashboard-operator-ui.md
  - notes/reference/api-surface.md
graph_checked: 2026-04-11
next_action: If operators need zero-friction filtering, replace submit-based query filtering with debounced URL updates in a small client controller while preserving SSR snapshots.
---

# Session - Dashboard Performance And Ops Filter Refactor

## What Changed

- added URL-backed text filters to both workbenches:
  - `/candidates?...&q=`
  - `/positions?...&q=`
- preserved filter and list state when opening detail pages and returning:
  - `bucket|book`
  - `sort`
  - `q`
  - `focus`
- switched more internal navigation paths to Next route transitions to reduce full-page reloads on common desk flows
- replaced per-component pin-state listeners with one shared `PinnedItemsProvider` context:
  - no more one `storage` and custom-event listener per row-level pin button
  - localStorage sync is still preserved across tabs
- reduced formatter overhead:
  - reused a shared timestamp formatter
  - cached currency formatters by precision
- improved `fetchJson()` request handling:
  - no forced `content-type` header on `GET` and `HEAD`
  - keeps JSON content-type for write requests by default

## Operator Impact

- queue and book triage is faster when filtering by symbol, mint fragment, blocker phrase, intervention, or exit reason
- returning from detail pages now keeps the exact investigative context instead of dumping operators back to an unfiltered list
- pin interactions stay responsive on dense tables because pin state is no longer running redundant hook listeners per row

## Verification

```bash
cd /Users/rukaiyahyusuf/Downloads/bot-trading/trading_bot/dashboard
npm run build

curl -sS http://127.0.0.1:3101/health
curl -sS -X POST http://127.0.0.1:3101/api/control/run-research-dry-run
curl -sS http://127.0.0.1:3101/api/research-runs?limit=1

cd /Users/rukaiyahyusuf/Downloads/bot-trading
$(git rev-parse --show-toplevel)/.codex/scripts/graphify-rebuild.sh
```

Latest dry-run runtime check after this refactor:

- run id: `cmnu3qjgd000307pxkhzgukeg`
- status: `COMPLETED`
- `errorMessage = null`
- discovered/evaluated/mock-opened: `0 / 0 / 0`
- provider burn: `birdeyeUnitsUsed=100`, `heliusUnitsUsed=0`

## Durable Notes Updated

- `notes/reference/dashboard-operator-ui.md`
- `notes/reference/api-surface.md`
- `notes/sessions/index.md`
- `notes/sessions/2026-04-11-dashboard-performance-and-ops-filter-refactor.md`
