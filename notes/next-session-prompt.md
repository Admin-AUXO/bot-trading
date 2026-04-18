# Next Agent Session — Briefing Prompt

Paste this as the opening message of the next Claude Code session in this repo.

---

## Context

You are continuing structured planning for a Solana DEX memecoin trading bot. **No implementation — produce structured draft docs only**, same format as the existing set.

**Read these files before doing anything else:**

- [`draft_index.md`](../draft_index.md) — entry point; maps all docs and reading orders
- [`draft_rollout_plan.md`](../draft_rollout_plan.md) — phases 1–5 are now **IMPLEMENTED**; phase 6 not yet shipped
- [`draft_database_plan.md`](../draft_database_plan.md) — current schema (12 tables, 25 views)
- [`draft_backend_plan.md`](../draft_backend_plan.md) — service-by-service spec
- [`draft_strategy_packs_v2.md`](../draft_strategy_packs_v2.md) — 10 packs, adaptive engine
- [`draft_market_stats_upgrade.md`](../draft_market_stats_upgrade.md) — free provider list
- [`draft_dashboard_plan.md`](../draft_dashboard_plan.md) — existing Next.js page-by-page plan (to be revised)
- [`draft_grafana_plan.md`](../draft_grafana_plan.md) — existing Grafana plan (to be **replaced**, not extended)

**Stack already in place:** Next.js 16 · React 19 · Prisma 7 · PostgreSQL 16 · AG Grid 35 · Radix UI · Tailwind 4 · TanStack Form · Recharts · react-resizable-panels · cmdk · sonner · lucide-react · motion · zod · Birdeye Lite plan · Helius Developer plan · Jupiter routing · Jito bundles.

---

## How to work

Use sub-agents for independent research tracks — do not serialize work that can run in parallel:

- Spawn a **research sub-agent** for any Helius or free-provider API surface audit (read-only, web research permitted).
- Spawn a **schema sub-agent** for database additions and view definitions.
- Spawn a **dashboard sub-agent** for the Next.js page-by-page plan.
- Spawn a **grafana sub-agent** for the new Grafana plan.
- Run the research sub-agent(s) first; feed their findings into the schema, dashboard, and grafana agents.
- Write final docs yourself after collecting sub-agent results — do not delegate the final write.

Keep each sub-agent prompt self-contained (include repo context, relevant file paths, and a clear output spec).

---

## Work items

### 1 · Helius deeper integration

Audit every Helius endpoint not yet wired into services and evaluate each for trading value. Cover at minimum:

`getWalletFundedBy` · `getSignaturesForAsset` · `getTokenHolders` · `laserstreamSubscribe` · `transactionSubscribe` · `accountSubscribe` · `parseTransactions` · `getPriorityFeeEstimate`

For each: signal produced, when to call it, credit cost, cache TTL, and which service or pack benefits. Map findings to three outcomes:

- **Pre-entry filtering** — creator lineage, holder velocity, bundle-detection fallback
- **Open-position management** — LP removal, holder dump detection, priority fee spikes
- **Smart-money stream quality** — wallet curation, event deduplication, signal freshness

Output: `draft_helius_integration.md`

---

### 2 · Entry and exit execution

Document best-practice entry and exit execution given the stack (Jito, Jupiter, Helius priority fees):

- **Entry** — timing vs. bonding-curve grad / pool creation; slippage caps per MC tier; min liquidity floor
- **Exit** — partial fill ladders, trailing stop vs. target-tier, exec latency SLA, stuck-position fallback
- **Priority fee strategy** — when to overpay, when to cap, `getPriorityFeeEstimate` call pattern

Every recommendation must tie to a named pack parameter, service method, or DB column so it is directly implementable. Include an ASCII decision tree for entry and one for exit.

Output: `draft_execution_plan.md`

---

### 3 · Database additions for analysis and iteration

Propose schema additions (Prisma syntax + views only — no raw migrations) that enable:

- **Config replay** — re-run any closed session offline with different pack thresholds
- **Threshold search** — query closed positions for the mc_min / vol_min / hold_cap combination that maximises EV over a lookback window
- **Enrichment quality tracking** — did Trench bundle score correlate with exit PnL? per-provider signal-to-noise over time
- **Mutator outcome attribution** — which adaptive mutator firings improved vs. hurt results
- **Credit audit log** — provider, endpoint, credits consumed, session_id, time bucket (feeds item 4)

Flag any existing table that can be compressed or deleted once these additions land. Include retention policy for every new table.

Output: update `draft_database_plan.md` with a clearly marked `## Phase 6+ additions` section

---

### 4 · API credit monitoring and session budgeting

Design a credit-tracking system for Birdeye (Lite) and Helius (Developer):

- New DB table (or extension) logging: provider, endpoint, call_count, credits_used, session_id, bucket (hourly)
- **Session budget estimate** — given discovery rate (tokens/hour) + enrichment calls per token + position-management calls per open position, compute expected credit burn as a range. Compare actual vs. expected at session end. Surface as a session-level field or summary view.
- **Alert thresholds** — daily forecast over budget; endpoint efficiency rank (credits per actionable signal)
- Grafana panel spec for "Provider Credit Burn" dashboard (expected vs. actual overlay; endpoint ranking bar chart)

Output: `draft_credit_tracking.md`

---

### 5 · Free provider efficiency plan

For each provider in `draft_market_stats_upgrade.md` (Trench · Bubblemaps · Solsniffer · Pump.fun public · Jupiter · GeckoTerminal · Cielo · DefiLlama), document:

- Exact call pattern — trigger condition, cache TTL, rate limit, failure fallback
- DB column / table where result lands and retention window
- Signal weight in the composite security score
- Role: gates entry / informs hold / display-only

Produce:
1. A reference table (one row per provider)
2. An ASCII call-sequence diagram for the full enrichment pipeline (discovery → enrich → evaluate → position → exit)

Output: replace §A–§B of `draft_market_stats_upgrade.md` with the above (keep sources section)

---

### 6 · Grafana plan — full rewrite

**Discard the old plan entirely.** Design new dashboards from scratch using the updated schema and views from items 3–4. Do not carry over any panel that relies on a view that no longer exists.

Rules:
- Every dashboard uses the auto-generator (extend `dashboard-generator/index.mjs`); no hand-authored JSON
- Every panel backed by a named view; list the view SQL inline or reference the exact section in `draft_database_plan.md`
- All panels support `$pack`, `$config_version`, `$source` multi-select filters
- No dashboard without acceptance criteria

Required dashboards (redesign from scratch):

| Dashboard | Primary job |
|-----------|-------------|
| **Session Overview** | Live session health — lane RAG, exposure, last-fill age, pause reason |
| **Pack Leaderboard** | Promote / retire packs — WR, EV, avg winner/loser, hold time per pack |
| **Candidate Funnel** | Diagnose where candidates die — waterfall + rejection reasons |
| **Exit RCA** | Root-cause bad exits — exit reason × PnL × hold time |
| **Credit Burn** | Birdeye + Helius spend vs. budget — endpoint ranking, session forecast |
| **Adaptive Telemetry** | Mutator firing rate, threshold drift, mutator → outcome correlation |
| **Enrichment Quality** | Per-provider signal-to-noise, cache hit rate, latency |

Output: rewrite `draft_grafana_plan.md` in full

---

### 7 · Next.js dashboard — page-by-page plan (full rewrite)

The existing `draft_dashboard_plan.md` covers the shell and 13 pages but needs a deeper pass now that the schema and new services are defined. Rewrite it with the following focus:

**Shell and navigation:**
- Persistent sidebar: 3 sections (Operational Desk / Strategy Workbench / Market Intel), collapsible, keyboard-navigable
- Top session banner: pack @ version, mode (LIVE/DRY/SANDBOX), PnL today, pause/resume, credit burn indicator (% of daily budget used — sourced from item 4)
- Command palette (cmdk): every primary action exposed with a shortcut; list all shortcuts in the doc
- Breadcrumbs on detail pages only; no breadcrumbs on list/overview pages

**Per-page spec — for every page include:**
- Route and page title
- One-sentence job (the decision it drives)
- Primary action (one, above the fold)
- Panel budget (max 6) with panel name, data source (view or endpoint), and purpose
- ASCII layout sketch (header / sidebar / main content zones)
- Empty / loading / error states
- Keyboard shortcuts
- Bloat guard (what you will NOT add and why)

**Pages to cover (at minimum):**

*Operational Desk*
- `/desk/overview` — live session summary, lane health, open positions, credit burn widget
- `/desk/trading` — open positions table (AG Grid), per-position enrichment strip, manual exit controls
- `/desk/settings` — session config, pack selector, mode gate (LIVE requires 2FA + IP confirm)

*Strategy Workbench*
- `/workbench/packs` — pack list (status × grade), promote/retire controls
- `/workbench/editor` — pack parameter editor, validation, version diff
- `/workbench/sandbox` — paper-trade runner, real-time PnL, stop controls
- `/workbench/grader` — closed-run grader, PackGradingService suggestions, accept/reject
- `/workbench/sessions` — session history, per-session credit summary, replay link

*Market Intel*
- `/market/token/[mint]` — full token detail: enrichment panels (bundle, cluster, creator, pools, security composite, Pump.fun origin, holder velocity, smart-money strip)
- `/market/trending` — Birdeye trending + discovery queue preview
- `/market/watchlist` — saved mints, alert triggers, bulk enrich action

**Layout improvements to specify explicitly:**
- Panel resize handles (react-resizable-panels) — which pages use them and default split ratios
- Sticky table headers and column freeze for all AG Grid pages
- Mobile breakpoints — which pages collapse to single-column and how
- Dark mode — already assumed; call out any color-sensitive panel (e.g. RAG status)

Output: rewrite `draft_dashboard_plan.md` in full

---

### 8 · Updated rollout plan

Update `draft_rollout_plan.md`:
- Mark phases 1–5 complete
- Revise phase 6 scope to include: credit-tracking table, session-budget logic, Helius expansion, execution improvements, Grafana rewrite, dashboard rewrite
- Add any new sub-agent roles needed (e.g. `execution-optimiser`, `credit-tracker`)
- Keep global guardrails section intact

---

## Output checklist

- [ ] `draft_helius_integration.md` — new
- [ ] `draft_execution_plan.md` — new
- [ ] `draft_database_plan.md` — updated (`## Phase 6+ additions` section)
- [ ] `draft_credit_tracking.md` — new
- [ ] `draft_market_stats_upgrade.md` — §A–§B replaced
- [ ] `draft_grafana_plan.md` — full rewrite
- [ ] `draft_dashboard_plan.md` — full rewrite
- [ ] `draft_rollout_plan.md` — phases 1–5 marked complete, phase 6 revised
- [ ] `draft_index.md` — updated to list new docs and reading orders
- [ ] Commit all changes to `main`
