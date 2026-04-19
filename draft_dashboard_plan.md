# Dashboard UI Plan — Remaining

Companion to [draft_rollout_plan.md §3.7](draft_rollout_plan.md). Snapshot **2026-04-18**.

The Next.js dashboard at [trading_bot/dashboard/](trading_bot/dashboard/) has real pages for all the major surfaces. This plan covers LIVE-mode guards, intervention clarity, and legacy cleanup.

---

## 1. Pages landed

| Route | File | Status |
|---|---|---|
| `/` | `app/page.tsx` | Real |
| `/candidates` | `app/candidates/` | Real |
| `/positions` | `app/positions/` | Real |
| `/market/trending` | `app/market/trending/page.tsx` | Real |
| `/market/token/[mint]` | `app/market/token/[mint]/` | Real |
| `/market/watchlist` | `app/market/watchlist/page.tsx` | Real |
| `/workbench/packs` | `app/workbench/packs/page.tsx` | Real |
| `/workbench/editor` + `[id]` | `app/workbench/editor/` | Real |
| `/workbench/sandbox` + `[runId]` | `app/workbench/sandbox/` | Real |
| `/workbench/grader` + `[runId]` | `app/workbench/grader/` | Real |
| `/workbench/sessions` | `app/workbench/sessions/page.tsx` | Real |
| `/operational-desk/overview` | `app/operational-desk/overview/` | Real |
| `/operational-desk/settings` | `app/operational-desk/settings/` | Real |
| `/operational-desk/trading` | `app/operational-desk/trading/` | Real |

---

## 2. Remaining work

### 2.1 LIVE-mode guards (priority)

The Session page can flip a pack to `mode=LIVE`. Missing server-side guards:

- **IP allowlist** — an operator's session may only set LIVE if the request comes from an allowlisted IP. List in `compose.env` (`LIVE_MODE_ALLOW_IPS`). Enforce in `session-routes.ts` before calling `TradingSessionService.setMode`.
- **2FA confirmation** — a 6-digit TOTP code must accompany the LIVE flip. Tie to an existing auth provider or ship a minimal TOTP check (operator pastes the code).
- **Pack grade gate** — only packs with `grade ∈ {A, B}` may be set to LIVE. Already enforced per guardrails; add a UI warning banner if operator tries from UI.
- **Capital brake** — on manual entry > $100 notional, require a second confirmation click with the exact dollar amount typed.

One PR per guard, each independently revertable.

### 2.2 Intervention band

Session Overview dashboard and the Session page share an "intervention band": a single horizontal strip showing:

```
[ Pack: <name> v<version> ] [ Config: v<configVersion> ] [ Mode: <mode> ] [ Adaptive: <on/off> ] [ Pause: <reason/—> ]
```

Always visible. Clicking any chip opens the respective detail panel. The operator must never be ambiguous about what's running.

Implement as `components/intervention-band.tsx` consumed by both the Session page and the Operational Desk overview.

### 2.3 Discovery-lab compatibility removal

Remaining UI code that references the deprecated discovery-lab surface:

- Any `app/discovery-lab/*` route (grep — if present, delete).
- `components/results-board.tsx` still consumes discovery-lab types — decompose into:
  - `components/results/run-grid.tsx` — the AG Grid table of runs.
  - `components/results/candidate-drawer.tsx` — the side drawer with candidate detail.
  - `components/results/action-panel.tsx` — grade / apply-live buttons.

Decompose first, delete imports second, drop source files third. Each is a separate PR.

### 2.4 Market page completeness

`/market/token/[mint]` renders the enrichment bundle. Missing panels per [draft_market_stats_upgrade.md §4.5](draft_market_stats_upgrade.md): Bundle & Snipers, Cluster map thumbnail, Creator history, Pools table, Security composite ring, Pump.fun origin, Holder velocity sparkline, Smart-money strip.

Three of these are stubbed (check component tree); five need new components. Each consumes the bundle already returned by `/api/operator/enrichment/:mint`.

### 2.5 Workbench editor — adaptive weights

`/workbench/editor/[id]` should expose the composite-score weight overrides per pack (see [draft_market_stats_upgrade.md §4.2](draft_market_stats_upgrade.md)). Validation: sum within `[0.99, 1.01]`, no negatives, no weight on disabled providers. Show a red banner on save if invalid.

### 2.6 Run grader — MutatorOutcome surface

`/workbench/grader/[runId]` should show per-mutator verdict counts + realized vs counterfactual PnL when `MutatorOutcome` rows exist. This depends on [draft_backend_plan.md §2.1](draft_backend_plan.md) (MutatorOutcome writes).

### 2.7 Session page — forecast brake

Before opening a session, display the `CreditForecastService` projection:

```
Projected monthly burn: Birdeye 420k / 500k ✓    Helius 8.1M / 10M ✓
```

Red text when projection exceeds budget; the "Open session" button becomes "Open session (over-budget)" and requires explicit confirmation.

---

## 3. Component conventions

- AG Grid 35 for tabular; never build a custom table.
- Radix + Tailwind 4 primitives; no custom design-system wrappers.
- TanStack Form for any writable form (pack editor, session create).
- Recharts for time series; no Chart.js or Plotly.
- All API calls via the typed client at `lib/api/`; do not `fetch` directly inside pages.

---

## 4. Parallel Work Packages

UI-surface WPs. WP-UI-5 depends on WP-BE-4 (credit forecast) being exposed via the API — block B1 until WP-BE-4 lands.

### WP-UI-1 — LIVE-mode guards (= rollout WP9)

**Owner:** `backend-extractor` (server) + `dashboard-decomposer` (UI warning).
**Scope:** new `services/session/live-guards.ts`, [api/routes/session-routes.ts](trading_bot/backend/src/api/routes/session-routes.ts) LIVE-flip path, [api/routes/run-routes.ts](trading_bot/backend/src/api/routes/run-routes.ts) manual-entry POST, `dashboard/app/operational-desk/trading/page.tsx` warning banner.
**Acceptance:** LIVE flip returns 403 `{ code: 'live-guard-failed', guard: '...' }` when IP or TOTP missing; manual entry > $100 refuses without `confirmationUsd === notionalUsd`; UI shows a red banner for ineligible (non-A/B grade) packs pre-flip.

**Prompt:**
> Create `trading_bot/backend/src/services/session/live-guards.ts` exporting `enforceIpAllowlist(req)` (reads `LIVE_MODE_ALLOW_IPS` env CSV), `enforceTotp(req, code)` (verify 6-digit TOTP against `LIVE_MODE_TOTP_SECRET` using `otplib`), `enforceCapitalBrake(notionalUsd, confirmationUsd)` (requires exact match when notional > 100). Wire in `api/routes/session-routes.ts` on any PATCH that sets `mode: 'LIVE'` and `api/routes/run-routes.ts` on manual-entry POST. Return `403 { code: 'live-guard-failed', guard: 'ip'|'totp'|'capital-brake' }`. Write `tests/session/live-guards.test.ts`. On the UI side, add a red banner to `dashboard/app/operational-desk/trading/page.tsx` when the selected pack's `grade ∉ {A,B}` — disable the LIVE button.

### WP-UI-2 — results-board decomposition (= rollout WP10)

**Owner:** `dashboard-decomposer`.
**Scope:** `dashboard/components/results-board.tsx` → three files under `dashboard/components/results/`.
**Acceptance:** original file deleted; three files (`run-grid.tsx`, `candidate-drawer.tsx`, `action-panel.tsx`) created; `cd trading_bot/dashboard && pnpm typecheck` clean; every `app/**` importer migrated.

**Prompt:**
> Split `trading_bot/dashboard/components/results-board.tsx` into three files under `trading_bot/dashboard/components/results/`: `run-grid.tsx` (AG Grid table), `candidate-drawer.tsx` (side drawer), `action-panel.tsx` (grade + apply-live buttons). Preserve every prop contract; no behavioral or styling change. Update all `import { ResultsBoard } from ...` sites under `dashboard/app/**`. Delete the original file. Run `pnpm typecheck`. This is a purely structural PR.

### WP-UI-3 — 8 market panels (= rollout WP13, = WP-MK-4)

**Owner:** `dashboard-decomposer`.
**Scope:** see WP-MK-4 in [draft_market_stats_upgrade.md §5](draft_market_stats_upgrade.md). Single WP.

### WP-UI-4 — Intervention band (= rollout B1 part 1)

**Owner:** `dashboard-decomposer`.
**Scope:** new `dashboard/components/intervention-band.tsx`, `dashboard/app/workbench/sessions/page.tsx`, `dashboard/app/operational-desk/overview/page.tsx`.
**Acceptance:** band shows `[Pack v#] [Config v#] [Mode] [Adaptive on/off] [Pause reason]` as sticky top strip; each chip is clickable and opens the respective detail panel.

**Prompt:**
> Create `trading_bot/dashboard/components/intervention-band.tsx` as a sticky horizontal strip showing `[Pack <name> v<version>] [Config v<configVersion>] [Mode: <mode>] [Adaptive: <on/off>] [Pause: <reason/—>]`. Consume `/api/operator/sessions/current` via `lib/api/sessions.ts` (create it if it doesn't exist; typed client, no direct `fetch`). Each chip is a Radix `Popover` trigger opening the matching detail panel from existing pages (reuse components where possible). Mount on the Session page (`dashboard/app/workbench/sessions/page.tsx`) and Operational Desk overview (`dashboard/app/operational-desk/overview/page.tsx`). Use Tailwind 4; no custom design-system wrappers.

### WP-UI-5 — Credit forecast brake (= rollout B1 part 2)

**Owner:** `dashboard-decomposer`.
**Scope:** `dashboard/app/workbench/sessions/page.tsx` session-open form + `dashboard/lib/api/sessions.ts`.
**Acceptance:** form shows `Projected monthly burn: Birdeye 420k / 500k ✓ Helius 8.1M / 10M ✓`; red text + "Open session (over-budget)" button copy when projection exceeds budget; requires `allowOverBudget: true` checkbox before submit.

**Prompt:**
> Depends on WP-BE-4 exposing `CreditForecastService.projectForSession` via a new `POST /api/operator/sessions/forecast` route (add the route in this same WP — it's 20 lines, no service changes). Update the session-open form in `dashboard/app/workbench/sessions/page.tsx`: on pack+hours selection change, POST to forecast, render `Projected monthly burn: Birdeye {projectedMtd} / {monthlyBudget} {✓|✗}` for each provider. Red text + switch button copy to "Open session (over-budget)" when either exceeds. Add `allowOverBudget` checkbox below — required to enable submit in over-budget state. Use TanStack Form.

### WP-UI-6 — Composite weights editor

**Owner:** `dashboard-decomposer`.
**Scope:** `dashboard/app/workbench/editor/[id]/page.tsx`, reuse the validator from WP-MK-2.
**Acceptance:** editor surfaces `config.composite.weights` as 8 numeric inputs; on blur or save, runs the server-side validator; red banner on violation; save disabled while invalid.

**Prompt:**
> Update `trading_bot/dashboard/app/workbench/editor/[id]/page.tsx` to expose the `config.composite.weights` section as 8 labeled numeric inputs (one per provider: Trench, Bubblemaps, Solsniffer, Pump.fun, Jupiter, GeckoTerminal, DefiLlama, Cielo). Use TanStack Form. On blur, call `POST /api/operator/packs/validate-draft` (create if missing — 10-line route delegating to `strategy-pack-draft-validator`); show returned errors inline + red banner. Disable the Save button while `errors.length > 0`. Do NOT reimplement validation client-side — always server-validate to keep the contract in one place.

### WP-UI-7 — MutatorOutcome surface on grader

**Owner:** `dashboard-decomposer`.
**Scope:** `dashboard/app/workbench/grader/[runId]/page.tsx`, new API route `GET /api/operator/runs/:runId/mutator-outcomes`.
**Acceptance:** grader page shows per-`mutatorCode` verdict counts + avg realized PnL + counterfactual delta when `MutatorOutcome` rows exist; gracefully empty state when none.

**Prompt:**
> Depends on WP-BE-1 landing `MutatorOutcome` writes. Add `GET /api/operator/runs/:runId/mutator-outcomes` that groups `MutatorOutcome` rows joined via `Position.runId` by `mutatorCode` + `verdict` and returns counts + `AVG(exitPnlUsd)` + `AVG(counterfactualPnlUsd)`. Add a card to `dashboard/app/workbench/grader/[runId]/page.tsx` titled "Adaptive Mutator Attribution" showing a table per mutator: helped/hurt/neutral counts, avg realized PnL, counterfactual delta (null → "—"). Empty state: `<p>No mutator activity in this run.</p>`. Use AG Grid 35.

---

## 5. Acceptance

- LIVE-mode flip requires IP + 2FA + grade check (server-side).
- Capital brake on manual entry > $100.
- Intervention band visible on Session + Operational Desk pages.
- `results-board.tsx` decomposed into three files; discovery-lab routes deleted.
- `/market/token/[mint]` renders all 8 panels.
- `/workbench/editor/[id]` supports composite weight overrides with validation.
- `/workbench/grader/[runId]` shows MutatorOutcome attribution.
- Session page shows credit forecast with over-budget guard.
