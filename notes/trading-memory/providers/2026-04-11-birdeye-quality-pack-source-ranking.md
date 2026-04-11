---
type: trading-memory
status: active
area: trading/providers
date: 2026-04-11
source_files:
  - trading_bot/backend/scripts/discovery-lab.ts
  - trading_bot/backend/scripts/discovery-lab.recipes.quality.json
  - trading_bot/backend/scripts/discovery-lab.recipes.fast-turn.json
graph_checked: 2026-04-11
next_action: Re-run the pump controls plus the `grad_75m_price30m_strength` recipe in another live window before promoting any new discovery preset.
---

# Trading Memory - Birdeye Quality Pack Source Ranking

## Durable Findings

- `pump_dot_fun` is still the only serious default source for graduation-play discovery in this repo.
- `moonshot` and `raydium_launchlab` were dead zones in the sampled window.
- `meteora_dynamic_bonding_curve` can surface attention, but not reliable pass-grade execution quality yet.
- If a name looks strong in the query summary and still fails deep grading, read the reject reason before touching the recipe. Concentration remains the usual liar.

## Best Current Pump Shapes

- `grad_4h_holder_liquidity`
  best efficiency per CU and the first fast-turn shape worth re-checking
- `grad_4h_volume1h`
  best quality mix in the sampled pump window
- `grad_75m_price30m_strength`
  first experimental follow-up worth another fresh-window check

## Shapes To Avoid By Default

- `grad_20m_trade1m_impulse`
  fake urgency in the sampled window; returned `0` real passes
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
- Use `grad_4h_holder_liquidity` first when the desk wants efficient fast-turn rechecks.
- Use `grad_4h_volume1h` first when the desk wants a wider quality-biased pump sweep.
- Treat `grad_75m_price30m_strength` as the only current experimental follow-up worth another live-window run.
- Do not loosen concentration controls just because raw score or volume looks attractive.
- Do not spend another pass on `grad_20m_trade1m_impulse` unless the desk is explicitly testing a hyper-churn window.

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
