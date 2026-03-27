# Dashboard Patterns (Next.js 16)

## Data Fetching
- TanStack Query for all server data — no direct fetch in components
- `queryKey` arrays must include all variables that affect the query: `['positions', mode]`, `['position-history', page, strategy, mode]`
- `refetchInterval` only on live data (open positions, overview): 3000ms
- `enabled: tab === 'x'` to defer fetches until tab is active
- `useQueryClient()` + `queryClient.invalidateQueries()` after mutations to refresh affected data

## Mutations
```typescript
const mutation = useMutation({
  mutationFn: (id: string) => manualExit(id),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['positions'] });
    setExitingId(null);
  },
  onError: (err) => setActionError(getErrorMessage(err)),
});
```
- Track pending state with local `useState` (`enteringId`, `exitingId`) — don't rely on `mutation.isPending` alone when multiple rows share a mutation
- Show inline error messages near the triggering action, not just a toast
- For fire-and-forget mutations with loading/success/error feedback, use Sonner's `toast.promise()`:

```typescript
toast.promise(mutation.mutateAsync(payload), {
  loading: 'Saving...',
  success: 'Saved',
  error: 'Failed to save',
});
```

## API Client (`dashboard/lib/api.ts`)
- Use `ky` — not fetch/axios. Base instance with `prefixUrl: '/'` and `timeout: 10_000`
- All API functions return typed promises: `api.get('api/...').json<ResponseType>()`
- Relative URLs only — no hardcoded `localhost` or ports (proxy handled at infra level)
- `getErrorMessage(err)` utility for extracting human-readable errors from ky `HTTPError`

## State Management
- Global UI state (mode filter, selectedStrategy) in `useDashboardStore` (Zustand)
- Server state in TanStack Query — never duplicate in Zustand
- Local component state for UI-only state (tab, page, dialog open/close, error message)

## Component Patterns
- `"use client"` only in components that use hooks or browser APIs
- `ErrorBoundary` wrapper on data-dependent sections
- `TableSkeleton` for loading states on tables
- Lucide icons for actions: `LogIn` (enter), `LogOut` (exit), `Download` (export)
- Icon renames in lucide-react v1: `CheckCircle2` → `CircleCheck`

## Decimal / Number Display
- All price/amount fields from API are already `number` (route handlers convert Prisma Decimal)
- Format with utils: `formatUsd`, `formatSol`, `formatPercent`, `pnlClass` for conditional coloring
- P&L: red if negative, green if positive — use `pnlClass(value)` utility

## Pagination Pattern
```typescript
const [page, setPage] = useState(1);
// reset page on filter change:
useEffect(() => setPage(1), [selectedStrategy, mode]);
// controls:
<button onClick={() => setPage(p => p - 1)} disabled={page === 1}>
<button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>
```

## Tabs Pattern
- Track active tab in local state: `useState<'open' | 'history' | 'skipped'>('open')`
- Defer expensive queries with `enabled: tab === 'history'`
- Reset sub-page to 1 when switching tabs

## Tailwind v4
- No `tailwind.config.ts` — config is CSS-first, defined in `app/globals.css`
- Theme tokens live in the `@theme {}` block as CSS variables: `--color-accent-green`, `--font-mono`, etc.
- `@import "tailwindcss"` replaces the old `@tailwind base/components/utilities` directives
- Dark mode via `@variant dark (&:where(.dark, .dark *))` — equivalent to v3's `darkMode: "class"`
- All existing utility classes (`bg-bg-primary`, `text-accent-green`, `font-mono`, etc.) work unchanged
- Custom components still use `@layer components { .card { @apply ... } }` — unchanged from v3
- PostCSS plugin is `@tailwindcss/postcss`, not `tailwindcss`

## Recharts v3
- `contentStyle` prop on `<Tooltip>` is **removed** — replace with:
  - `wrapperStyle` — outer container (background, border, border-radius)
  - `itemStyle` — per-item text style (color, font-size)
  - `labelStyle` — label text style
- `Formatter` callback `value` is `ValueType` (`string | number | (string|number)[]`) — do not annotate as `number`; use `Number(value)` coercion:

```typescript
// correct
formatter={(value) => [`$${(Number(value) || 0).toFixed(2)}`, 'P&L']}

// wrong — TypeScript error in v3
formatter={(value: number) => [`$${value.toFixed(2)}`, 'P&L']}
```

- Custom `content` prop on Tooltip: no style props needed — renders its own JSX

## URL Search Param State (nuqs)
`NuqsAdapter` wraps the root layout — use `useQueryState` / `useQueryStates` for URL-serializable page-scoped filters:
```typescript
import { parseAsStringLiteral, useQueryState } from "nuqs";

const DATE_RANGES = ["7d", "14d", "30d", "60d", "90d"] as const;

const [dateRange, setDateRange] = useQueryState(
  "dateRange",
  parseAsStringLiteral(DATE_RANGES).withDefault("30d"),
);
```
- Use nuqs for page-scoped filters that benefit from URL persistence (dateRange, tab selection, page number)
- Keep global cross-page state (mode, selectedStrategy) in Zustand — don't duplicate in URL
- `parseAsStringLiteral(ALLOWED_VALUES).withDefault(...)` validates + provides type safety

## Typecheck
- No `typecheck` npm script in dashboard — run directly: `npx tsc --noEmit` from `dashboard/`
