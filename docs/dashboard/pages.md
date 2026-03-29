# Dashboard Pages

These are the actual route surfaces. Page wrappers are thin; feature modules own the logic.

## `/`

- Feature file: `dashboard/features/overview/overview-page.tsx`
- Uses shared shell state plus recent daily stats and API-usage queries
- Shows operating picture, risk queue, strategy exposure, quota pulse, recent flow, and daily P&L
- Scope rule:
  runtime shell is always active-lane truth; recent analytics can reflect a selected analysis lane if it differs

## `/positions`

- Feature file: `dashboard/features/positions/positions-page.tsx`
- Tabs:
  open, history, skipped
- Open tab shows filtered positions but portfolio capacity comes from runtime-wide shell data
- Manual entry/exit actions only execute on the active runtime lane
- Time budgets and staged exits only resolve when the analysis lane matches the active runtime lane

## `/trades`

- Feature file: `dashboard/features/trades/trades-page.tsx`
- Tabs:
  trades, signals
- Trades tab is lane-scoped and can filter by trade source
- Signals tab shows pass/reject flow; trade-source filtering does not apply to signal rows
- Exports CSV for executed fills

## `/analytics`

- Feature file: `dashboard/features/analytics/analytics-page-client.tsx`
- Suspense-wrapped because it uses `nuqs` query state
- Shows capital curve, strategy performance, execution quality, P&L distribution, missed opportunities, graduation events, wallet activity, and regime history
- Scope rule:
  some cards are lane-scoped, some are mode/profile-scoped, some are explicitly global feeds

## `/quota`

- Feature file: `dashboard/features/quota/quota-page-client.tsx`
- Suspense-wrapped because it uses `nuqs` query state
- Shows current provider pressure, daily burn chart, monthly trajectory, and endpoint concentration
- Scope rule:
  service budgets are global; endpoint sections narrow when lane metadata exists

## `/settings`

- Feature file: `dashboard/features/settings/settings-page.tsx`
- Owns bot pause/resume, operator unlock/lock, process health, strategy config, risk limits, quota summary, and config profiles
- `reconcile-wallet` is only shown in `LIVE`
- Profile activation for the active mode can become a runtime switch, and that is blocked while positions remain open

## Shared Page Metadata

- `trading_bot/dashboard/lib/page-meta.ts`

Keep page title and description text aligned with the real surface when route behavior changes.
