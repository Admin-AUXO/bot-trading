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

- `created-early-grad-scalp-tape-surge`
  earliest post-grad scalp pack; best for the freshest tape and the fastest first-rotation windows
- `created-early-grad-scalp-buyer-stack`
  keeps the early tape bias but leans harder on 5m buyer participation
- `created-early-grad-scalp-liquidity-ramp`
  widens the early scalp ladder toward deeper pools without leaving the fast post-grad window
- `created-early-grad-scalp-momentum-retest`
  keeps fresh-tape recency but biases more toward churn persistence after the first retest
- `created-early-grad-scalp-quality-guard`
  most selective early scalp pack; strongest holder, liquidity, and drawdown guardrails

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

## Provider Ceiling Update

- On 2026-04-18 the repo-created scalp packs were trimmed again so the default lab path actually runs under Birdeye's provider ceiling.
- The redundant per-recipe `min_volume_1m_usd` and `max_market_cap` filters were removed from the created packs because the pack thresholds already enforced the same intent.
- If a repo-created pack starts failing with `Maximum 5 concurrently filters` again, check the recipe params before touching the backend filter counter.

## Reuse Rules

- Keep `pump_dot_fun` as the default live and research source until another venue proves it can produce pass-grade names repeatedly.
- Use `created-early-grad-scalp-tape-surge` or `created-early-grad-scalp-buyer-stack` first when the desk wants the freshest scalp windows.
- Use `created-early-grad-scalp-liquidity-ramp` when the desk wants more pool depth without leaving the early scalp regime.
- Use `created-early-grad-scalp-momentum-retest` when the desk wants a stronger churn-persistence bias instead of pure recency.
- Use `created-early-grad-scalp-quality-guard` when the desk wants the tightest structural screen and can tolerate lower recall.
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
