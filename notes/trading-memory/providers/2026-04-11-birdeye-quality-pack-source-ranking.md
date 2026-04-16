---
type: trading-memory
status: active
area: trading/providers
date: 2026-04-12
source_files:
  - trading_bot/backend/scripts/discovery-lab.ts
  - trading_bot/backend/scripts/discovery-lab/runner.ts
  - trading_bot/backend/src/services/discovery-lab-created-packs.ts
graph_checked: 2026-04-12
next_action: Compare the five created packs across another live pump window and check whether the late-expansion quality stack still earns pass-grade names once the fresh-burst window cools.
---

# Trading Memory - Birdeye Quality Pack Source Ranking

## Durable Findings

- `pump_dot_fun` is still the only serious default source for graduation-play discovery in this repo.
- `moonshot` and `raydium_launchlab` were dead zones in the sampled window.
- `meteora_dynamic_bonding_curve` can surface attention, but not reliable pass-grade execution quality yet.
- If a name looks strong in the query summary and still fails deep grading, read the reject reason before touching the recipe. Concentration remains the usual liar.
- The discovery lab now uses repo-created packs instead of starter JSON files. Each created pack carries four graduated strategies with mixed volume and graduation-recency windows plus pack-level threshold overrides.

## Current Created Pack Set

- `created-fresh-burst-ladder`
  earliest post-grad burst pack; best for testing the first 12 to 45 minutes
- `created-early-flow-balance`
  blends fast 5m flow with wider 30m and 1h participation
- `created-holder-supported-continuation`
  raises holder and liquidity support while staying inside continuation windows
- `created-reclaim-strength-stack`
  leans on 30m and 1h reclaim strength instead of pure tape urgency
- `created-late-expansion-quality`
  latest-window quality pack for deeper liquidity, broader holders, and 1h expansion

## Shapes To Avoid By Default

- pregrad scout recipes in the quality or fast-turn packs
  dead research spend in the sampled windows; none produced a pass-grade name
- `grad_15m_trade5m`
  too brittle in the refreshed fast-turn window; removed from the fast-turn pack
- `grad_20m_trade1m_impulse`
  fake urgency in the sampled window; returned `0` real passes and still does not belong in the repo packs
- broad source expansion to `moonshot` or `raydium_launchlab`
  extra noise without extra quality

## Working Research Lens

The sampled quality pack produced pass-grade names only after relaxing to this research lens:

- `minLiquidityUsd=10000`
- `minHolders=50`
- `minVolume5mUsd=2500`
- `minUniqueBuyers5m=20`
- `minBuySellRatio=1.15`
- `maxTop10HolderPercent=40`
- `maxSingleHolderPercent=20`

Use this as a research lens, not as permission to weaken live concentration controls.

## Reuse Rules

- Keep `pump_dot_fun` as the default live and research source until another venue proves it can produce pass-grade names repeatedly.
- Use `created-fresh-burst-ladder` or `created-early-flow-balance` first when the desk wants very fresh continuation windows.
- Use `created-holder-supported-continuation` when you want more structural support without jumping all the way to the late pack.
- Use `created-reclaim-strength-stack` when the desk wants momentum and reclaim bias instead of raw recency.
- Use `created-late-expansion-quality` when the desk wants the strongest holder and liquidity bias.
- Do not loosen concentration controls just because raw score or volume looks attractive.
- Do not spend another default pass on pregrad scouts, `grad_15m_trade5m`, or `grad_20m_trade1m_impulse` unless the desk is explicitly testing a weird churn window.

## Provider Fact

- Birdeye added `1m` and `30m` meme-list sort and filter intervals on `2026-02-10`.
- That does not make every new field useful. The `30m` shape earned one more check; the `1m` impulse did not.

Sources:

- <https://docs.birdeye.so/changelog/20260210-release-extra-intervals-for-token-meme-list>
- <https://docs.birdeye.so/reference/get-defi-v3-token-meme-list>

## Linked Notes

- [`2026-04-11-birdeye-discovery-endpoint-selection.md`](2026-04-11-birdeye-discovery-endpoint-selection.md)
- [`../../investigations/2026-04-11-birdeye-discovery-lab-quality-pack-sweep.md`](../../investigations/2026-04-11-birdeye-discovery-lab-quality-pack-sweep.md)
- [`../../runbooks/2026-04-11-birdeye-discovery-lab.md`](../../runbooks/2026-04-11-birdeye-discovery-lab.md)
