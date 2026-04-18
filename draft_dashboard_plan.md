# Dashboard Plan — Next.js Pages, Layout, UI/UX (Page-by-Page)

Companion to [draft_index.md](draft_index.md), [draft_backend_plan.md](draft_backend_plan.md), [draft_workflow_principles.md](draft_workflow_principles.md).

**Stack (already in place — reuse, don't reinvent):** Next.js 16, React 19, AG Grid 35, Radix (dialog / tabs / tooltip), Tailwind 4, TanStack Form, Recharts, react-resizable-panels, cmdk (command palette), sonner (toasts), lucide icons, motion, zod.

**Shell (keep):** [components/app-shell.tsx](trading_bot/dashboard/components/app-shell.tsx) — sidebar + command palette + 15 s poll of `/desk/shell`. Extend, do not replace.

---

## 1. Design principles (the anti-bloat contract)

Follow every rule on every page:

1. **One job per page.** If you can't state the decision the page drives in one sentence, split it.
2. **One primary action per page.** Visible above the fold. Secondary actions live in a row menu or overflow.
3. **Budget before panels.** Each page has a panel budget (3–6). Adding a 7th panel requires deleting one.
4. **Data before decoration.** No stat card without a delta or threshold. No chart without a comparison.
5. **One grid per page.** AG Grid monolith pattern is fine; tables-inside-tables are not.
6. **Server-render the shell, stream the data.** Page skeletons are server components; interactive panels are `"use client"` islands using the existing `fetchJson` pattern.
7. **File size budget:** page.tsx ≤150 lines (server shell only); client components ≤400 lines; any >400 lines file must decompose before review.
8. **Reuse primitives:** `dashboard-primitives.tsx` (StatusPill, stat cards), `ag-grid-shared.tsx`, `ui/` (Radix + CVA). No new button / card / dialog components — extend existing.
9. **Empty, loading, error — all three** on every panel. No bare spinner; no silent empty.
10. **Keyboard-first.** Every primary action has a shortcut; cmdk palette exposes it.

---

## 2. App shell + global nav (extend existing)

The current `AppShell` already owns: sidebar, collapse-state persistence, command palette, shell actions (pause / resume / discover-now / evaluate-now / exit-check-now), status pill, toasts.

Extend — don't replace — with:

- **Session banner** (top strip, full width, slim): current `TradingSession.packName @ version`, mode (`LIVE` / `DRY` / `SANDBOX`), started-at, realized PnL today, pause/resume/revert. Red border when paused. Sticky on scroll.
- **Secondary nav (tab strip under banner)** for each section. `Operational Desk`, `Strategy Workbench`, `Market Intel`. Section picked by sidebar; tab strip picks page within section. Avoids deep sidebar trees.
- **cmdk palette additions:** "Clone pack X", "Start session", "Grade last run", "Open token <mint>", "Revert to previous pack version".
- **Breadcrumbs:** on detail pages only (`/positions/:id`, `/market/token/:mint`). Section → page → record.

Sidebar IA collapses to **3 top-level sections**:

```
Operational Desk
  Overview   ·   Trading   ·   Settings

Strategy Workbench
  Packs   ·   Editor   ·   Sandbox   ·   Grader   ·   Sessions

Market Intel
  Token Lookup   ·   Trending   ·   Watchlist
```

No other top-level items. No redirect-only URLs. `/` redirects to `/operational-desk/overview`.

---

## 3. Information architecture — current vs target

**Delete** (currently exist, all redirect-only or fragmented):

| Route | Lines | Fate |
|---|---|---|
| `/discovery-lab` | 5 | delete |
| `/discovery-lab/overview` | 5 | delete |
| `/discovery-lab/run-lab` | 7 | delete |
| `/settings` | 8 | delete |
| `/discovery-lab/config` | 34 | fold into `/workbench/editor` |
| `/discovery-lab/strategy-ideas` | 10 | fold into `/workbench/grader` |
| `/discovery-lab/studio` | 19 | fold into `/workbench/sandbox` |
| `/discovery-lab/results` | 51 | rename to `/workbench/sandbox/[runId]` |
| `/discovery-lab/market-stats` | 10 | rename to `/market/trending` |

**Keep + upgrade:**

| Route | Current lines | Target |
|---|---|---|
| `/operational-desk/overview` | 122 | keep shape, swap stats to use `ExitPlan` + `AdaptiveThresholdLog` columns |
| `/operational-desk/trading` | 395 | decompose (see §4.2) |
| `/operational-desk/settings` | 33 | keep shell; pack fields leave for Editor |
| `/candidates/[id]` | 303 | add adaptive mutation log + bundle/creator cards |
| `/positions/[id]` | 343 | add exit-plan track + adaptive log (see §4.3) |

**New** (phase 4): `/workbench/packs`, `/editor`, `/editor/:id`, `/sandbox`, `/sandbox/:runId`, `/grader/:runId`, `/sessions`, `/market/token/[mint]`, `/market/trending`, `/market/watchlist`.

---

## 4. Page-by-page spec

Each page spec has: **job · primary action · layout · panels · data · empty/loading/error · keyboard · bloat guard**.

### 4.1 `/operational-desk/overview` — Overview

**Job:** in 20 seconds, is the bot healthy and is today OK.
**Primary action:** none (pure monitoring; shell owns pause/resume).
**Layout:** top row = 4 stat cards, middle = 2 charts side-by-side, bottom = recent events feed.

```
┌──────────────────────────────────────────────────────┐
│ [Capital free] [Open pos] [24h PnL] [Pack: X v3]    │ ← stat cards w/ deltas
├──────────────────────┬───────────────────────────────┤
│ PnL sparkline 24h    │ Candidate funnel (today)      │ ← Recharts
├──────────────────────┴───────────────────────────────┤
│ Recent events (filled, closed, paused, adaptive)    │ ← AG Grid compact
└──────────────────────────────────────────────────────┘
```

**Panels (budget 5):** 4 stats · 2 charts · 1 event feed = 7. Collapse stats into one card row → 5.
**Data:** `/api/operator/overview` (new composite, server-component render); event feed streams `/api/operator/events/recent?limit=50`.
**Empty:** "No trades today — capital free $X." **Loading:** skeleton stat cards (existing `SkeletonRow`). **Error:** inline red banner, retry.
**Keyboard:** `g o` jumps here; `r` refreshes.
**Bloat guard:** do NOT add per-pack breakdown here; that's Pack Leaderboard in Grafana.

---

### 4.2 `/operational-desk/trading` — Trading (candidates + positions)

Current monolith ([trading/page.tsx](trading_bot/dashboard/app/operational-desk/trading/page.tsx) 395L). Split.

**Job:** see what's being evaluated, what's open, act on either.
**Primary action:** *Open Manual Entry* (top-right). Secondary: *Force Exit* on row.
**Layout:** Radix tabs → `Candidates` | `Positions`. Each tab = one AG Grid.

```
┌────────────────────────────────────────────────────┐
│ [Tabs: Candidates | Positions]   [+ Manual Entry] │
├────────────────────────────────────────────────────┤
│  AG Grid (virtualized, server-paginated)          │
│  - quick-filter row                                │
│  - pinned columns: mint, pack, score, age         │
│  - row-click → detail drawer (not nav)            │
└────────────────────────────────────────────────────┘
```

**Detail drawer** (right-side sheet via Radix Dialog): mini version of `/candidates/:id` / `/positions/:id`. Full page for deep dive; drawer for quick decisions.
**Columns (candidates):** mint, pack, entryScore, exitProfile, age, top filter firing, reject reason (if rejected).
**Columns (positions):** mint, pack, entry, markPrice, uPnL %, holdTime, SL / TP1 / TP2 (from `ExitPlan`), adaptive-log count.
**Data:** `/api/operator/candidates?cursor=&pack=&status=` and `/api/operator/positions?status=open`. Server-pagination, 100/page.
**Empty:** "No candidates in the last hour. Discovery lane green." **Loading:** skeleton grid rows. **Error:** grid shows banner, retry button.
**Keyboard:** `j/k` row nav, `Enter` opens drawer, `Esc` closes, `e` force-exit (with confirm).
**Bloat guard:** no inline chart columns; no "maybe useful" filter dropdowns. Quick-filter + column menu cover 95 %.

Decomposition target:
- `app/operational-desk/trading/page.tsx` — server shell, tab wiring (≤80 L)
- `components/trading/CandidatesGrid.tsx` (reuse existing, trim to ≤250 L)
- `components/trading/PositionsGrid.tsx` (reuse existing, trim)
- `components/trading/ManualEntryDialog.tsx` (Radix Dialog + TanStack Form)
- `components/trading/TokenDrawer.tsx` (Radix Dialog side sheet)
- `components/trading/RowActions.tsx` (reuse `workbench-row-actions.tsx`)

---

### 4.3 `/positions/[id]` — Position detail

**Job:** understand why this position entered, how it's exiting, what adaptive did.
**Primary action:** *Force Exit* (top-right, red, confirm dialog).
**Layout:** top meta bar, 4 tabs.

```
┌──────────────────────────────────────────────────────────┐
│ Symbol · mint · pack v · entered · state        [Exit]  │
├──────────────────────────────────────────────────────────┤
│ Tabs: Overview | Exit Plan | Adaptive Log | Fills       │
├──────────────────────────────────────────────────────────┤
│ (active tab body — one panel per tab)                   │
└──────────────────────────────────────────────────────────┘
```

**Tab: Overview** — price sparkline with entry + current marker; entry-time bundle / cluster / creator banner (from `EnrichmentFact`).
**Tab: Exit Plan** — price track with SL / TP1 / TP2 markers (Recharts ComposedChart, horizontal rule lines from `ExitPlan` row); mutators applied; time-to-next-threshold.
**Tab: Adaptive Log** — table of every `AdaptiveThresholdLog` row for this position: axis, before, after, reasonCode, time.
**Tab: Fills** — all `Fill` rows, latency cohort (this vs. last 100, from promoted `Fill.*LatencyMs` columns), fee drag, PnL attribution bar (entry timing vs. exit timing vs. fees).
**Data:** `/api/operator/positions/:id` (one composite payload); streams on mount, polls at 5 s while `status=OPEN`, stops on close.
**Empty:** N/A (detail page). **Loading:** tab-level skeleton. **Error:** per-tab banner.
**Keyboard:** `1..4` tab jump, `e` force exit, `[`/`]` prev/next position in grid order.
**Bloat guard:** NO full order book, NO full trade tape — that's Birdeye's job; link out.

---

### 4.4 `/candidates/[id]` — Candidate detail

Same skeleton as positions but tabs: `Overview | Filters Fired | Enrichment | Raw Snapshot`. **Primary action:** *Buy Manually* (behind capital brake + confirm). Enrichment tab uses the same panels as `/market/token/:mint`.

---

### 4.5 `/operational-desk/settings` — Deployment settings

**Job:** change deployment knobs (capital, cadence, pauses, env). **Not** strategy.
**Primary action:** *Save* (sticky footer, shows diff).
**Layout:** single form, Radix Tabs → `Capital`, `Cadence`, `Pauses`, `Env`, `Feature Flags`.
**Panels:** 1 form per tab (TanStack Form + zod).
**Data:** `GET /api/operator/settings`, `PATCH /api/operator/settings`. Dry-run validates first.
**Empty / loading / error:** form-level.
**Bloat guard:** strategy/filter/exit fields are **gone from here** — they live in `/workbench/editor`. Pack selector is gone too (Sessions owns pack selection). Settings is deployment-only.

---

### 4.6 `/workbench/packs` — Packs library

**Job:** see all packs, pick one to edit, clone, or retire.
**Primary action:** *New Pack* (top-right). Row: *Clone*, *Open Editor*, *Start Sandbox*, *Retire*.
**Layout:** AG Grid, one row per `StrategyPack` (all versions collapsed; expand to show versions).

```
┌────────────────────────────────────────────────────────────┐
│ [filters: status · grade · sortColumn]      [+ New Pack]  │
├────────────────────────────────────────────────────────────┤
│  name · version · status · grade · capMod · sortCol ·     │
│  acceptance · WR · EV · lastRunAt · ... actions           │
└────────────────────────────────────────────────────────────┘
```

**Columns:** name, version, status (pill: DRAFT / TESTING / GRADED / LIVE / RETIRED), grade (A–F), capitalModifier, sortColumn, acceptance %, WR %, EV, lastRunAt, row actions.
**Data:** `/api/operator/packs?status=&grade=` server-paginated.
**Empty:** "No packs yet — import seeds from draft_strategy_packs_v2.md". **Loading:** skeleton. **Error:** inline.
**Keyboard:** `n` new, `Enter` open editor, `c` clone.
**Bloat guard:** NO inline charts, NO PnL breakdowns — those belong in Grafana Pack Leaderboard. This page is the library, not the analytics.

---

### 4.7 `/workbench/editor` and `/workbench/editor/[id]` — Pack editor

**Job:** edit one pack; see its effect on live tape before saving.
**Primary action:** *Save Draft* (sticky bottom). Secondary: *Publish → TESTING* (only on draft), *Discard*.
**Layout:** three vertical panes (react-resizable-panels). Left = metadata, middle = forms, right = live preview.

```
┌─────────┬─────────────────────────────┬────────────────────┐
│ Meta    │ Tabs: Filters | Exits |     │ Live Preview       │
│ name    │       Adaptive | Enrichment │ (last 10 min tape) │
│ sort    │                             │                    │
│ capMod  │ TanStack Form fields        │ AG Grid:           │
│ axes    │ with zod validation,        │ - mint             │
│ grade   │ inline error states,        │ - would-accept?    │
│ status  │ live-preview re-runs on     │ - filter firing    │
│ history │ change (debounced 500 ms).  │ - sim PnL          │
│         │                             │                    │
└─────────┴─────────────────────────────┴────────────────────┘
```

**Form tabs:**
- **Filters** — 4 filter slots (exactly 4, see strategy pack principles); each slot = field picker + operator + threshold. "Add filter" is disabled at 4 until one is removed.
- **Exits** — SL %, TP1 ×, TP2 ×, TP1 size %, TP2 size %, time-stop, MC-tier overrides, grad-age taper toggle. Visual preview: horizontal rules on a generic chart.
- **Adaptive** — toggle each axis (session, perf, drawdown, consec, exposure, entry-score floor); per-axis bounds.
- **Enrichment** — per-source toggles (Trench / Bubblemaps / Solsniffer / Cielo / Creator lineage) with TTL display.

**Live preview:** hits `/api/operator/packs/:id/runs?mode=SANDBOX&preview=true`; streams last 10 min of tape showing which candidates the current form would accept. Re-runs on form change (debounce 500 ms).
**Data:** `GET/PATCH /api/operator/packs/:id`; preview over WebSocket or SSE.
**Empty:** for new draft, pre-fill from template picker. **Loading:** form skeleton. **Error:** field-level messages from zod.
**Keyboard:** `Cmd+S` save, `Cmd+Enter` publish (with confirm), `Cmd+K` opens palette scoped to pack fields.
**Bloat guard:** no backtest tab here (sandbox is its own page); no Grafana embeds; no manual tuning deltas (grader applies those).

File split:
- `app/workbench/editor/[id]/page.tsx` — server shell, loads pack (≤100 L)
- `components/workbench/editor/EditorLayout.tsx` — resizable panes (≤150 L)
- `components/workbench/editor/MetaPane.tsx`, `FiltersTab.tsx`, `ExitsTab.tsx`, `AdaptiveTab.tsx`, `EnrichmentTab.tsx` (≤250 L each)
- `components/workbench/editor/LivePreviewPane.tsx` (≤300 L)

---

### 4.8 `/workbench/sandbox` and `/workbench/sandbox/[runId]` — Sandbox runner

**Job:** run a pack against live tape, zero capital, capture a full trace.
**Primary action:** *Start Run* (index page) or *Stop Run* (detail page).
**Layout (index):** list of recent runs + *Start* button. **Layout (detail):** live-trace table + aggregate strip.

```
[detail]
┌──────────────────────────────────────────────────────────┐
│ Pack v · started · elapsed · cands · accepts · wins ·EV │ ← live strip
├──────────────────────────────────────────────────────────┤
│ Trace table (newest first, autoscroll toggle):          │
│ time · mint · decision · score · filter firing · why    │
└──────────────────────────────────────────────────────────┘
```

**Data:** `POST /api/operator/packs/:id/runs` starts; streams via SSE `/api/operator/runs/:id/stream`; row writes to `StrategyRun` + `StrategyRunGrade`.
**Empty:** "No runs yet. Pick a pack and Start Run." **Loading:** streaming placeholder. **Error:** run-status banner.
**Keyboard:** `s` start, `x` stop, `Space` pauses autoscroll.
**Bloat guard:** no historical backtest here (different tool); no per-filter histograms (grader has those).

---

### 4.9 `/workbench/grader/[runId]` — Pack grader

**Job:** mark last run's outcomes and accept auto-tuning suggestions.
**Primary action:** *Apply Tuning → New Draft Pack* (bottom-right).
**Layout:** top summary strip, middle two columns (tokens list + token review), bottom suggested tuning.

```
┌──────────────────────────────────────────────────────────┐
│ Run summary: WR · EV · avg winner · avg loser           │
├──────────────────────┬───────────────────────────────────┤
│ Tokens (AG Grid):    │ Token review panel:               │
│ mint · verdict · PnL │ price chart, filters fired,       │
│ · hold ·outcome      │ exit reason, notes textarea       │
│                      │ [TRUE_POS] [FALSE_POS]            │
│                      │ [MISSED_EXIT] [GOOD_EXIT]         │
├──────────────────────┴───────────────────────────────────┤
│ Suggested tuning deltas: +filter X ≥ Y (why)            │
│                         [Apply → new DRAFT pack]        │
└──────────────────────────────────────────────────────────┘
```

**Data:** `GET /api/operator/runs/:id`, `POST /api/operator/runs/:id/grade`, `POST /api/operator/runs/:id/suggest-tuning`.
**Empty:** run has no accepts → "No candidates to grade; tuning not available." **Loading:** skeleton panels. **Error:** inline.
**Keyboard:** `1..4` verdict shortcuts, `j/k` next/prev token, `a` apply tuning.
**Bloat guard:** grader is not a full analytics page — link to Grafana Exit Reason RCA for that.

---

### 4.10 `/workbench/sessions` — Session launcher + live health

**Job:** start / stop / revert a live or dry session.
**Primary action:** *Start Session* (blue, opens dialog) — mode picker, pack picker, 2FA + IP gate for `LIVE`.
**Layout:** current session card, health dials, historical sessions table.

```
┌──────────────────────────────────────────────────────────┐
│ Current session: pack v · mode · started · PnL today    │
│ [Pause] [Resume] [Stop] [Revert to v N-1]   [Start New]│
├──────────────────────────────────────────────────────────┤
│ Dials: capital free · open count · last-fill age ·      │
│ intervention band · webhook cap %                       │
├──────────────────────────────────────────────────────────┤
│ Historical sessions: pack · mode · duration · PnL · why │
└──────────────────────────────────────────────────────────┘
```

**Data:** `GET /api/operator/sessions/current`, `POST /api/operator/sessions`, `PATCH /api/operator/sessions/:id`.
**Empty:** "No active session. Start one." **Loading:** dial skeletons. **Error:** red banner with last-good state shown.
**Keyboard:** `p` pause, `r` resume, `s` stop (all confirm); `Cmd+Enter` in start dialog.
**Bloat guard:** this page is ops-critical — no experimental widgets, no A/B previews, no grafana embed. Keep interactions atomic.

---

### 4.11 `/market/trending` — Trending + smart money

**Job:** scan what's hot right now; pin things to watchlist.
**Primary action:** *Pin to Watchlist* on row.
**Layout:** filters bar + one AG Grid. Smart-money activity strip across top (last 10 tracked-wallet events).
**Columns:** mint, age-since-grad, MC, liq, buyers5m, B/S, rug score, bundle %, cluster %, smart-money hits 1h, actions.
**Data:** `/api/operator/market/trending?sort=&filter=` (server page 100/pg).
**Empty:** "No mints pass the current filter." **Loading:** grid skeleton. **Error:** inline.
**Keyboard:** `/` focuses filter, `p` pins current row, `Enter` opens `/market/token/:mint`.
**Bloat guard:** reuse the existing virtual-scroll grid pattern; do NOT add per-row sparklines (draws the grid to its knees); link to Birdeye for charts.

---

### 4.12 `/market/token/[mint]` — Full token view

**Job:** all the context on one mint, once. Deep dive before adding to watchlist / manual entry / grading.
**Primary action:** *Manual Entry* (behind capital brake). Secondary: *Pin*, *Open in Birdeye*.
**Layout:** two-column. Left = identity + price. Right = enrichment panels (one card per source).

```
┌──────────────────────────────┬───────────────────────────┐
│ Identity:                    │ Enrichment cards:         │
│ - symbol, mint, links        │ [Bundle (Trench)]        │
│ - creator lineage banner     │ [Cluster (Bubblemaps)]    │
│ - mint/freeze status         │ [Security (Solsniffer)]   │
│                              │ [Pools (GeckoTerminal)]   │
│ Price panel (Recharts):      │ [Smart money (Cielo)]     │
│ - 24h candles                │ [Creator history]         │
│ - entry-time marker if       │ [Pump.fun origin]         │
│   this mint has positions    │                           │
│                              │                           │
│ Actions: [Manual entry]      │                           │
│          [Pin] [Birdeye]     │                           │
└──────────────────────────────┴───────────────────────────┘
```

**Data:** single composite `GET /api/operator/enrichment/:mint` (fanout happens server-side inside `TokenEnrichmentService`, cached per TTL). Price panel separate `/api/operator/price/:mint?tf=1h`.
**Empty:** per card, show TTL + "no data yet" when the cache is cold and provider flagged off.
**Loading:** shimmer per card (cards resolve independently).
**Error:** per card ("Trench unavailable — 12 m stale"). Page never hard-fails on one provider.
**Keyboard:** `p` pin, `b` Birdeye, `m` manual entry dialog, `[`/`]` prev/next from trending grid.
**Bloat guard:** every card must justify its place — if a card is empty 80 % of the time, hide it behind a collapse. Do not add raw-API dump panels; those live behind a debug flag.

---

### 4.13 `/market/watchlist` — Watchlist

**Job:** pinned mints; fast re-check.
**Primary action:** *Unpin* on row.
**Layout:** same grid shape as trending but scoped.
**Data:** `/api/operator/watchlist` (reuses `pinned-items.tsx` store — already implemented).
**Bloat guard:** no separate analytics here; watchlist is a filter, not a dashboard.

---

## 5. Shared component library (reuse, don't duplicate)

| Need | Use | Source |
|---|---|---|
| Grid | AG Grid | [ag-grid-table.tsx](trading_bot/dashboard/components/ag-grid-table.tsx) + [ag-grid-shared.tsx](trading_bot/dashboard/components/ag-grid-shared.tsx) |
| Dialog / Sheet / Drawer | Radix Dialog | `components/ui/*` |
| Tabs | Radix Tabs | `components/ui/*` |
| Tooltip | Radix Tooltip | already in shell |
| Form | TanStack Form + zod | already in settings-client |
| Toast | sonner via `UiToast` | `components/ui-toast.tsx` |
| Chart | Recharts | existing |
| Resizable panes | react-resizable-panels | already a dep |
| Command palette | cmdk | already in shell |
| Icons | lucide-react | pin this set; no new icon packs |
| Class utils | clsx + tailwind-merge + CVA | existing |
| Animations | motion | sparingly — micro-interactions only |
| Stat cards / pills | `dashboard-primitives.tsx` | extend, don't clone |

**Rule:** new page introduces no new UI dependency. Extending primitives is allowed; inventing them isn't.

---

## 6. Data fetching patterns

| Pattern | When |
|---|---|
| Server component + RSC fetch | Page shells, static filter dropdowns, initial grid payload |
| `fetchJson` + `useEffect` polling (existing) | Shell status, overview cards, session health (5–15 s cadence) |
| SSE stream | Sandbox runs, live preview in Editor, smart-money event strip |
| AG Grid `serverSide` row model | Trending, Trading tabs, Packs library (when >1 k rows) |
| `POST` + optimistic toast | Actions: start/pause/stop, grade submit, clone, pin |
| WebSocket | Only if SSE can't carry the update rate — not needed today |

**Cadences:**
- Overview stats: 15 s
- Open positions mark price: 5 s
- Sandbox trace: push (SSE)
- Market stats: 30 s
- Enrichment cards: per-source TTL (honor cache headers)

Never poll below 3 s from the browser; server-side providers handle finer cadence.

---

## 7. File structure + size budgets

```
app/
  layout.tsx                                (shell)
  page.tsx                                  (redirect → overview)
  operational-desk/
    overview/page.tsx                       (≤150 L server shell)
    trading/page.tsx                        (≤80 L server shell)
    settings/page.tsx                       (≤80 L server shell)
  workbench/
    packs/page.tsx
    editor/[id]/page.tsx
    sandbox/page.tsx
    sandbox/[runId]/page.tsx
    grader/[runId]/page.tsx
    sessions/page.tsx
  market/
    trending/page.tsx
    watchlist/page.tsx
    token/[mint]/page.tsx
  candidates/[id]/page.tsx
  positions/[id]/page.tsx

components/
  shell/                                    (existing — keep)
  trading/                                  (new — decomposed from trading/page)
  workbench/
    packs/, editor/, sandbox/, grader/, sessions/
  market/
    trending/, token/, watchlist/
  primitives/                               (rename dashboard-primitives.tsx subdir)
  ui/                                       (existing Radix wrappers)
```

**Budgets:** `page.tsx` ≤150 L, any other component ≤400 L, feature directory ≤2000 L total. Exceeds = split before review.

---

## 8. Deletions (hard list)

| Path | Reason |
|---|---|
| `app/discovery-lab/` (all 9 routes) | Replaced by `/workbench/*` and `/market/*` |
| `app/settings/page.tsx` | Redirect-only |
| `app/page.tsx` (if redirect-only) | Redirect is cheaper in middleware |
| `components/discovery-lab-results-board.tsx` (5722 L) | Decompose into `workbench/sandbox/*` + `workbench/grader/*` |
| `components/discovery-lab-client.tsx` (956 L) | Replaced by Packs / Editor / Sandbox |
| `components/discovery-lab-market-stats-client.tsx` (936 L) | Replaced by `market/trending/*` and `market/token/*` |
| `components/discovery-lab-strategy-ideas-client.tsx` (699 L) | Replaced by Grader |
| `components/discovery-lab-results-route.tsx` (303 L) | Merged into sandbox route |
| Pack-editing fields inside `settings-client.tsx` | Move to Editor; Settings becomes deployment-only |

---

## 9. Acceptance criteria

- No route redirects except `/` → `/operational-desk/overview`.
- No `components/*.tsx` over 400 lines after phase 4.
- Every page states its job in one sentence inside a JSDoc header on the page.tsx file.
- Every panel has empty / loading / error states in code (no `{data && ...}` bare guards).
- No new UI dependency added beyond the current package.json.
- Every primary action has a keyboard shortcut exposed in the cmdk palette.
- `/market/token/:mint` first-paint p95 ≤1.5 s with all enrichment cards on.
- Lighthouse accessibility score ≥90 on every new page.
- Bundle size (Next.js build report) doesn't grow more than 15 % vs. pre-phase-4 baseline.

---

## 10. Phasing within phase 4

1. **4a — IA + shell:** session banner, sidebar collapse, delete redirect routes. Zero new pages. Verifies nothing else breaks.
2. **4b — Trading decomposition:** split `trading/page.tsx` + detail drawer. Replace monolith with sub-components.
3. **4c — Packs + Editor:** `/workbench/packs`, `/editor`. Live preview pane wired to sandbox-preview endpoint.
4. **4d — Sandbox + Grader:** full run lifecycle including suggest-tuning.
5. **4e — Sessions:** last, behind the 2FA/IP gate. Shell banner wires up once this lands.
6. **4f — Market Intel:** `/market/trending`, `/market/token/:mint`, `/market/watchlist`.
7. **4g — Cleanup:** delete all `discovery-lab/*` code + `settings-client` pack fields. Re-run bundle + Lighthouse checks.

Each sub-phase is independently revertable. No live-capital code path changes land in 4a–4f; 4e gates `mode=LIVE` with confirm + IP/2FA.
