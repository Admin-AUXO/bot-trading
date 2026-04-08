# Dashboard Pages

These are the actual route surfaces. Page wrappers are thin; feature modules own the logic.

## `/`

- Feature file: `dashboard/features/overview/overview-page.tsx`
- Uses shared shell state plus recent daily stats and API-usage queries
- Opens with a runtime-desk summary plus a single attention panel for the nearest forced exit or blocker
- Shows capital/risk tiles, runtime state, exit queue, deployment, provider pressure, recent flow, and daily P&L
- Scope rule:
  runtime shell is always active-lane truth; recent analytics can reflect a selected analysis lane if it differs

## `/positions`

- Feature file: `dashboard/features/positions/positions-page.tsx`
- Tabs: open, history, skip queue
- Opens with a single action-scope banner so the operator can tell whether manual controls are armed or only inspecting another lane
- Open tab shows filtered positions but portfolio capacity comes from runtime-wide shell data
- Manual entry/exit actions only execute on the active runtime lane
- Time budgets and staged exits only resolve when the analysis lane matches the active runtime lane

## `/trades`

- Feature file: `dashboard/features/trades/trades-page.tsx`
- Tabs: fills, signals
- Fills tab is lane-scoped and emphasizes fee drag and realized execution quality
- Signals tab shows pass/reject flow; trade-source filtering does not apply to signal rows
- Exports CSV for executed fills

## `/analytics`

- Feature file: `dashboard/features/analytics/analytics-page-client.tsx`
- Suspense-wrapped because it uses `nuqs` query state
- Opens with an edge-ledger summary: lookback, lane scope, trade-source scope, and aggregate manual share
- Shows capital curve, strategy performance, execution quality, P&L distribution, missed opportunities, graduation events, wallet activity, and regime history
- Scope rule:
  some cards are lane-scoped, some are mode/profile-scoped, some are explicitly global feeds

## `/quota`

- Feature file: `dashboard/features/quota/quota-page-client.tsx`
- Suspense-wrapped because it uses `nuqs` query state
- Opens with a provider-runway split:
  global service budgets vs lane-filtered endpoint drill-down
- Shows current provider pressure, daily burn chart, monthly trajectory, and endpoint concentration
- Scope rule:
  service budgets are global; endpoint sections narrow when lane metadata exists

## `/settings`

- Feature file: `dashboard/features/settings/settings-page.tsx`
- Opens with a command-surface summary of runtime, operator access, process state, and hard-stop alerts
- Owns bot pause/resume, operator unlock/lock, process health, strategy config, live-entry guardrails, risk limits, quota summary, and config profiles
- `reconcile-wallet` is only shown in `LIVE`
- Strategy cards surface the active runtime guardrails for stale-entry age, required trade data, and holder floors where applicable
- Profile cards show visible override summaries so a profile cannot silently weaken safety
- Profile override editing is inline on the settings page; blank fields remove overrides and revert to inherited defaults
- Editing the active runtime profile updates the live runtime lane immediately
- Profile activation for the active mode can become a runtime switch, and that is blocked while positions remain open

## Shared Page Metadata

- `trading_bot/dashboard/lib/page-meta.ts`

Keep page title and description text aligned with the real surface when route behavior changes.
