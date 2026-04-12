---
type: trading-memory
status: active
area: trading/providers
date: 2026-04-12
source_files:
  - trading_bot/backend/scripts/discovery-lab.ts
  - trading_bot/backend/scripts/discovery-lab.recipes.quality.json
  - trading_bot/backend/scripts/discovery-lab.recipes.fast-turn.json
graph_checked: 2026-04-12
next_action: Re-run the pump controls in another live window to see whether `grad_4h_volume1h`, `grad_4h_holder_liquidity`, and `grad_75m_price30m_strength` keep repeating after the current hot pump window cools off.
---

# Trading Memory - Birdeye Quality Pack Source Ranking

## Durable Findings

- `pump_dot_fun` is still the only serious default source for graduation-play discovery in this repo.
- `moonshot` and `raydium_launchlab` were dead zones in the sampled window.
- `meteora_dynamic_bonding_curve` can surface attention, but not reliable pass-grade execution quality yet.
- If a name looks strong in the query summary and still fails deep grading, read the reject reason before touching the recipe. Concentration remains the usual liar.

## Best Current Pump Shapes

- `grad_4h_holder_liquidity`
  best fast-turn winner and best efficiency per CU in the refreshed 2026-04-12 run
- `grad_4h_volume1h`
  best broad quality mix in the refreshed 2026-04-12 run
- `grad_75m_price30m_strength`
  best experimental follow-up after trimming the filter count back under Birdeye's ceiling

## Viable Secondary Shape

- `grad_45m_volume30m_persistence`
  workable secondary `30m` flow variant, but still noisier than the three main pump shapes

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
- Use `grad_4h_holder_liquidity` first when the desk wants efficient fast-turn rechecks.
- Use `grad_4h_volume1h` first when the desk wants a wider quality-biased pump sweep.
- Treat `grad_75m_price30m_strength` as the first experimental follow-up to pair with the controls.
- Keep `grad_45m_volume30m_persistence` as a secondary experiment only, not a control.
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
