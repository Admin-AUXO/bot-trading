---
type: session
status: active
area: dashboard
date: 2026-04-14
source_files:
  - trading_bot/dashboard/components/app-shell.tsx
  - trading_bot/dashboard/components/discovery-lab-client.tsx
  - trading_bot/dashboard/components/discovery-lab-results-board.tsx
  - trading_bot/dashboard/app/discovery-lab/page.tsx
  - trading_bot/dashboard/lib/types.ts
  - trading_bot/backend/scripts/discovery-lab.ts
  - trading_bot/backend/.local/discovery-lab/packs/scalp-tape-structure-v2.json
  - trading_bot/backend/.local/discovery-lab/packs/scalp-tape-structure.json
  - trading_bot/backend/.local/discovery-lab/packs/scalp-tape-volume-breadth.json
  - trading_bot/backend/.local/discovery-lab/packs/scalp-30m-strength-reclaim.json
  - trading_bot/backend/.local/discovery-lab/packs/scalp-structure-persistence.json
  - trading_bot/backend/.local/discovery-lab/packs/scalp-tight-cap-live-tape.json
  - trading_bot/dashboard/package.json
  - notes/reference/dashboard-operator-ui.md
graph_checked: 2026-04-14
next_action: Run one real provider-backed discovery-lab session against the refreshed local scalp pack set so the desk can compare which of the five new custom packs holds up outside the current hot window and whether the tighter-cap variants improve the 20 to 30 percent scalp target.
---

# Session - Discovery Lab Redesign And Shell Collapse

## Findings / Decisions

- The old discovery page tried to combine a large hero, a nested-scroll workbench, and same-page results. That broke the fixed-workbench claim on laptop heights and buried the main editing flow on mobile.
- The main app shell now needs a persistent collapsed desktop mode so the operator can reclaim width without losing primary navigation.
- Discovery is now organized around tabs and explicit editing surfaces instead of one long stacked pane.
- Six repo-local custom discovery-lab packs are now pre-seeded under `trading_bot/backend/.local/discovery-lab/packs/` so they appear in the dashboard catalog without manual cloning:
  `Scalp Tape + Structure`
  `Scalp Tape + Structure v2`
  `Scalp Tape + Volume Breadth`
  `Scalp 30m Strength Reclaim`
  `Scalp Structure Persistence`
  `Scalp Tight Cap Live Tape`
- The result board now treats per-token review as a two-step workflow: the table stays dense, and a `View details` action opens a side drawer with current desk-derived capital and exit guidance instead of forcing everything into the row.
- The token-details drawer now derives:
  suggested capital from the current runtime cash and slot pressure
  stop-loss and TP1/TP2 targets from the score-aware exit rules
  max hold time from the current exit profile
  a `2x confidence` score meaning confidence in a full `1x` gain from entry
- Discovery-lab reports now persist token price and structural metrics on each evaluated row, so the UI can compute those guidance values from the actual report instead of inventing placeholders client-side.

## What Changed

- `app-shell.tsx` now supports a persisted collapsible desktop sidebar with a compact icon rail and tooltip-backed nav labels.
- `discovery-lab-client.tsx` now uses top-level `Overview`, `Package`, `Strategies`, `Runs`, and `Results` tabs instead of the old fixed pane stack.
- Package editing is split into `Basics` and `Thresholds`, and package actions are explicit: use, clone, load the active run package, and delete.
- Strategy management moved into a dedicated studio with search, add, duplicate, remove, reorder, autosizing editors, and direct param JSON editing.
- `discovery-lab-results-board.tsx` now supports a full-screen results dialog and stacked mobile result cards instead of relying on a wide scroll-only table.
- Discovery result rows now expose both Axiom Pulse and DexScreener links from the deduplicated board and the raw-hit surface.
- The results board now includes a setup column with suggested capital, 2x confidence, max hold, and a `View details` action with an icon on both desktop rows and mobile cards.
- The new token-details drawer surfaces current price, liquidity, market cap, buy/sell ratio, holder structure, stop loss, TP1, TP2, max hold, and the derived exit profile for the selected mint.
- `trading_bot/backend/scripts/discovery-lab.ts`, `trading_bot/backend/src/services/discovery-lab-service.ts`, and `trading_bot/dashboard/lib/types.ts` now carry the extra price and structure fields needed by that drawer.
- Restored the original `Scalp Tape + Structure` winner and kept five newer local scalp pack JSONs so the dashboard catalog exposes a broader but still pump-only scalp set immediately.
- Added small headless UI packages for tabs, dialog, tooltips, and autosizing textareas.

## What I Verified

- `cd trading_bot/dashboard && npm install @radix-ui/react-dialog @radix-ui/react-tabs @radix-ui/react-tooltip react-textarea-autosize`
- `cd trading_bot/dashboard && npm run build`
- `cd trading_bot/backend && npm run build`
- `cd trading_bot/backend && npx tsx --eval '(async () => { const { DiscoveryLabService } = await import("./src/services/discovery-lab-service.ts"); const svc = new DiscoveryLabService(); await svc.ensure(); const cat = await svc.getCatalog(); console.log(JSON.stringify(cat.packs.filter((pack) => pack.kind === "custom").map((pack) => ({ id: pack.id, name: pack.name })), null, 2)); })();'`
- Browser checks against `http://127.0.0.1:3201/discovery-lab` for:
  desktop discovery tabs
  full-screen results
  collapsed sidebar state
  mobile page width and stacked result cards

## Remaining Risks

- Real provider-backed runs still need one pass so package save or delete, strategy updates, polling, and very large result sets are checked with live data.
- The strategy editor currently keeps JSON param editing inline; if operators start using much larger payloads, it may need a schema-aware editor instead of plain text.
- The new guidance drawer is only as fresh as the current report price input. If a run sits open for too long without a rerun, the stop-loss and target prices can drift from current tape even though the shape guidance still holds.

## Durable Notes Updated

- `notes/reference/dashboard-operator-ui.md`
