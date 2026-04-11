---
type: session
status: active
area: dashboard
date: 2026-04-11
source_files:
  - trading_bot/dashboard/components/settings-client.tsx
  - trading_bot/dashboard/app/candidates/page.tsx
  - trading_bot/dashboard/app/positions/page.tsx
  - trading_bot/dashboard/components/app-shell.tsx
  - trading_bot/dashboard/components/dashboard-client.tsx
  - trading_bot/dashboard/app/candidates/[id]/page.tsx
  - trading_bot/dashboard/app/positions/[id]/page.tsx
  - trading_bot/dashboard/app/telemetry/page.tsx
  - trading_bot/dashboard/app/research/page.tsx
  - trading_bot/dashboard/components/dashboard-primitives.tsx
  - trading_bot/dashboard/app/globals.css
  - notes/investigations/2026-04-10-dashboard-control-desk-audit.md
graph_checked: 2026-04-11
next_action: Re-run row-level browser verification once the runtime has at least one candidate row and one position row, then close the remaining action and Grafana-pivot checks against real entities.
---

# Session - Dashboard UX Execution Handoff

## Context

Code changed in this pass. The work moved beyond planning and implemented the main operator-desk UX changes for settings, candidates, positions, shell, homepage, and shared primitives.

The user wants the dashboard pushed further toward a real Solana graduation-play operator desk:

- homepage for immediate action
- candidates for fast blocker and tradability triage
- positions for intervention-first monitoring
- telemetry as a fault console
- research clearly sandboxed
- settings fixed first because the current flow is the most annoying part

The user explicitly does not want more descriptive copy. Labels should be short, with explanation moved into tooltips when needed.

## Product Decisions Locked In

- `/` is a command center, not an overview page
- above the fold on `/` should prioritize blockers and interventions
- `/candidates` should optimize for fast triage, not broad investigation
- `/positions` should optimize for current intervention need, not outcome review
- desktop density should lean toward a trading desk
- mobile is not a priority driver for this pass
- the first new functionality worth adding is:
  pinned watchlist
  inline table actions
- research must remain visually distinct from live operations
- open positions should visually outweigh closed outcomes and secondary context
- on the homepage, only exposure and queue summary cards are worth keeping; the rest should give way to a ranked intervention surface
- telemetry stays as a separate page, but only as a fault console

## Execution Order

1. Settings workflow
2. Candidates and positions workbenches
3. Global shell
4. Homepage tightening
5. Candidate and position detail pages
6. Telemetry and research separation
7. Shared UI primitive cleanup

## Implementation Progress - 2026-04-11

Implemented in this pass:

- `settings-client.tsx`
  added a visible `Draft -> Validate -> Dry run -> Promote` rail
  added field-level changed, unsaved, and live-gate cues against active values
  added inline diff lines and field-matched validation messages
  reduced emphasis on read-only advanced timing fields
- `candidates/page.tsx`
  added a sticky control rail
  added denser rows with front-of-queue emphasis
  added inline `Open`, `Pin`, `Grafana`, and `Copy` actions
- `positions/page.tsx`
  added a sticky control rail
  added top-priority row emphasis in the open book
  added inline `Open`, `Pin`, `Grafana`, and `Copy` actions
- `app-shell.tsx`
  slimmed the header into a single command rail
  added cheap route counts
  added a sidebar pinned-items block
- `dashboard-client.tsx`
  removed the filler quick-routes panel
  kept only exposure and queue stat cards above the fold
  added a compact pinned watchlist strip
  added a ranked intervention stack ahead of secondary context
- shared UI
  added local-storage backed pinned-items components
  tightened table density and urgency styling in globals and primitives
- `candidates/[id]/page.tsx`
  reworked the first screen into issue-first summary then decision trace, with raw evidence pushed lower
- `positions/[id]/page.tsx`
  reworked the first screen into action-first posture then decision trace, with linked origin and stored metadata separated from raw trail data
- `telemetry/page.tsx`
  tightened the page into a clearer fault-console hierarchy with live-slice summary and stronger fault-oriented section labels
- `research/page.tsx`
  tightened the page into a clearer dry-run sandbox hierarchy with muted operator treatment and explicit sandbox cues

Verification completed:

- `cd trading_bot/dashboard && npm run build`
- route responses checked with Node fetch:
  `/`
  `/settings`
  `/candidates`
  `/positions`
  `/telemetry`
  all returned `200`
- route responses also checked for `/research`, which returned `200`
- graph rebuilt with `$(git rev-parse --show-toplevel)/.codex/scripts/graphify-rebuild.sh`
- live dashboard container updated from the fresh local build output and restarted successfully
- headless browser verification completed against `http://127.0.0.1:3100` for:
  `/`
  `/settings`
  `/candidates`
  `/positions`
  `/telemetry`
  `/research`
- pinned-items persistence verified across refresh and route change using the production local-storage key
- screenshots captured during browser verification:
  `/tmp/dashboard-home-verify.png`
  `/tmp/dashboard-telemetry-verify.png`
  `/tmp/dashboard-research-verify.png`

Verification still pending:

- row-level click-through verification of inline actions on candidates and positions once data exists
- candidate-detail and position-detail browser verification once real entity rows exist
- end-to-end Grafana pivot verification from candidate and position rows once real entity rows exist

Current blocker:

- the current runtime has zero candidate rows and zero position rows across all buckets and books, so row-level actions and entity-detail pivots cannot be exercised against real data yet

## Pending Items

- browser validation is still incomplete:
  inline row actions
  candidate and position detail Grafana pivots
  list-state round-trip from detail pages back to workbenches
- if the settings workflow changes again, re-run browser checks against the visible step rail because text-only probes do not cover collapsed or inactive states reliably

## Next Steps

1. Wait for the runtime to produce at least one candidate row and one position row, then re-run browser verification on the workbenches and detail pages.
2. Confirm on real rows:
   inline `Open`, `Pin`, `Grafana`, and `Copy` actions behave correctly
   candidate and position back-link state still round-trips with bucket or book, sort, and focus
   candidate and position Grafana links land with the expected entity and time context
3. If the Compose image rebuild path is still needed in a later session, investigate the stalled Docker BuildKit frontend fetch separately instead of treating it as a dashboard-code problem.

## Guardrails

- Do not reintroduce long explanatory copy
- Do not add trend-heavy analytics back into Next.js
- Do not weaken backend-owned semantics with frontend-only logic
- Do not treat mobile as the layout driver for this pass
- Do not let closed positions or research surfaces compete visually with open-risk work

## Durable Notes Updated

- [`../investigations/2026-04-10-dashboard-control-desk-audit.md`](../investigations/2026-04-10-dashboard-control-desk-audit.md)
- [`../reference/dashboard-operator-ui.md`](../reference/dashboard-operator-ui.md)
