# Dashboard Plan — Lean Operator Surface

Companion to [implementation-plan.md](implementation-plan.md). Snapshot **2026-04-19**.

## Audit Log — 2026-04-19 ✅

Verified and resolved:

1. **Docker API fix** — `compose.env` `API_URL`: `127.0.0.1:3101` → `bot:3101`
2. **TTL fixes** — `pump.fun` TTL: 60 min; `cielo` TTL: 15 min (token-enrichment-service.ts)
3. **Stat grid optimization** — columns reduced 5-6 → 3-4 for readability
4. **Back links** — added to `/market/token/[mint]` page
5. **Workbench routes** — grader and sandbox now render content (no redirect)
6. **StatusTone utility** — extracted to `dashboard/lib/status.ts`
7. **API routes** — all 12 routes verified working

The dashboard is already a real Next.js App Router app. The work now is to remove bloat, make the data flow obvious, and keep the operator path easy to test.

## Current reality

- Global shell ownership lives in `components/app-shell.tsx`.
- Browser writes and interactive reads go through `lib/api.ts` and `app/api/[...path]/route.ts`.
- Server-rendered pages read the backend directly through `lib/server-api.ts`.
- The heaviest remaining bloat is not missing pages; it is duplicated fetches, duplicated polling, and leftover compatibility chrome.

## App Router boundary contract

- Server Components may fetch the backend directly.
- Route Handlers are for browser-facing endpoints and auth/same-origin boundaries, not as an internal hop for SSR pages.
- Server Actions should stay mutation-first; do not introduce them just to fetch read data.
- Browser mutations stay behind the dashboard proxy.
- Deep-link detail pages can exist, but each surface should have one canonical list/owner route.
- If a screen polls, define one polling owner for that screen.

## Layout and UX contract

Every page should use the same operator-first structure:

1. page title + one-sentence status summary,
2. primary actions row,
3. key metrics strip,
4. main workspace content,
5. secondary diagnostics below the fold.

Keep these rules across the app:

- Put the most important decision or action in the top-right primary action area.
- Show the current state before the controls that can change it.
- Use one sticky action bar for destructive or high-value actions instead of scattering buttons through cards.
- Collapse secondary diagnostics, raw JSON, and rarely used controls into drawers, tabs, or “advanced” sections.
- Reuse the same patterns for status chips, danger states, empty states, loading blocks, and refresh controls.
- Prefer fewer, larger cards with clear labels over many small tiles competing for attention.

## Remove this bloat first

### 1. Market token N+1 fetches

`app/market/token/[mint]/page.tsx` already loads enrichment, but provider cards re-fetch the same payload. Collapse that to one enrichment load and pass source state down as props.

**Why:** easiest win for latency, testability, and component clarity.

### 2. Duplicate market list wrappers

`/market/trending` and `/market/watchlist` differ mostly by mode. Move shared server fetch logic into one helper and keep the pages thin.

### 3. Refresh ownership drift

`AppShell`, `DashboardClient`, and page-local actions all trigger refresh behavior. Reduce this to one owner per surface instead of stacked polling plus global events.

### 4. Stale discovery-lab copy

`settings-client.tsx`, `next.config.ts`, and a few workbench assumptions still carry discovery-lab language or redirect baggage. Remove the wording and keep only intentional compatibility redirects.

### 5. Layout inconsistency across pages

The routes exist, but the information hierarchy is uneven. Some pages lead with dense data before actions, some bury the important controls, and some mix diagnostics with the main operator flow.

Standardize page anatomy across:

- `operational-desk/*`: current session state, pause/resume/live actions, alerts, recent events
- `workbench/*`: pack/run identity, status, key results, primary next actions, then details
- `market/*`: token/trend summary first, trade-relevant signals second, provider diagnostics last

## Implementation order

### A. Data-boundary cleanup

**Files**
- `trading_bot/dashboard/lib/{api.ts,server-api.ts}`
- `trading_bot/dashboard/app/api/[...path]/route.ts`
- `trading_bot/dashboard/app/market/**`

**Acceptance**
- One short note in code or docs explains when to use `serverFetch` vs the proxy client.
- No server-rendered page bounces through the proxy without a real reason.

### B. Market surface cleanup

**Files**
- `trading_bot/dashboard/app/market/trending/page.tsx`
- `trading_bot/dashboard/app/market/watchlist/page.tsx`
- `trading_bot/dashboard/app/market/token/[mint]/page.tsx`

**Acceptance**
- Token detail does one enrichment fetch per render path.
- Trending and watchlist share a single data-loading helper.
- Stub panels are called out explicitly; do not treat the page as greenfield.

### C. Dashboard-wide layout sweep

**Files**
- `trading_bot/dashboard/components/app-shell.tsx`
- `trading_bot/dashboard/app/operational-desk/**`
- `trading_bot/dashboard/app/workbench/**`
- `trading_bot/dashboard/app/market/**`
- shared components created during the sweep

**Acceptance**
- Every major page has a clear title, summary, metrics strip, and action row.
- Primary actions are visually consistent across desk, workbench, and market pages.
- Secondary diagnostics move below the main workspace or behind an advanced reveal.
- Repeated card/header/button patterns are extracted into shared dashboard components where it helps.

### D. Workbench and settings cleanup

**Files**
- `trading_bot/dashboard/components/settings-client.tsx`
- `trading_bot/dashboard/components/workbench/**`
- `trading_bot/dashboard/next.config.ts`

**Acceptance**
- No stale discovery-lab labels remain in active operator UI.
- Editor/grader/detail wrappers stay thin around the shared surfaces.

### E. Polling simplification

**Files**
- `trading_bot/dashboard/components/app-shell.tsx`
- `trading_bot/dashboard/components/dashboard-client.tsx`
- any page-local polling hook that duplicates those owners

**Acceptance**
- Each major screen documents one refresh owner and interval.
- Tests can mock one refresh source per screen instead of multiple timers.

## Test plan

- One server-component smoke test for a direct `serverFetch` page.
- One client mutation test through the proxy route.
- One regression test proving `/market/token/[mint]` does not re-fetch enrichment per card.
- One route/redirect test for the intentionally supported legacy paths.
- One layout regression pass for the major page shells so action bars and summary blocks stay consistent.

## Done when

- The dashboard plan no longer references dead `results-board` work.
- The market and workbench screens are thinner without changing backend contracts.
- A new agent can tell, in one pass, where SSR reads belong, where browser writes belong, where polling lives, and what the page layout pattern should be.
