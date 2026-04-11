---
type: trading-memory
status: active
area: trading/providers
date: 2026-04-11
source_files:
  - trading_bot/backend/src/services/birdeye-client.ts
  - trading_bot/backend/src/engine/graduation-engine.ts
  - trading_bot/backend/src/config/env.ts
graph_checked: 2026-04-11
next_action: Re-check Birdeye docs before widening discovery away from meme-list-first graduation scans.
---

# Trading Memory - Birdeye Discovery Endpoint Selection

## What Was Confirmed

Birdeye `GET /defi/v3/token/meme/list` is the better primary discovery endpoint for graduation plays than `GET /defi/v3/token/list`.

## Why

- `token/meme/list` exposes graduation-native fields and filters such as `source`, `graduated`, `graduated_time`, `creation_time`, and `progress_percent`
- `token/list` is a generic chain-wide token screener and does not expose graduation-specific filters
- for this repo, the live discovery lane already uses `token/meme/list` and expects graduated meme-token discovery rather than generic chain-wide token listing

## Reuse Rule

- use `token/meme/list` as the default discovery endpoint for new tradable graduation candidates
- if one sweep is not enough, paginate or rotate sort fields on `token/meme/list` before adding `token/list`
- if you need broader recall, use `token/list` only as a secondary catch-up pass, not as the primary graduation discovery lane

## Recommended Query Shape

- keep `x-chain=solana`
- keep `source=all` for maximum Solana recall in one call unless the desk is intentionally pump-only
- keep `graduated=true`
- primary sort should be `graduated_time desc`
- secondary rotations can use `recent_listing_time desc` and `last_trade_unix_time desc`
- keep coarse API filters only: `min_graduated_time`, `min_last_trade_unix_time`, `min_liquidity`
- apply extra gates like holders and tighter activity floors after the response

## Watchouts

- the repo observed a provider-side meme-list filter ceiling: six concurrent filters caused `400 Maximum 5 concurrently filters`
- two 100-CU discovery calls per sweep would materially increase Birdeye discovery burn against the repo's default lane budget, so alternating endpoints every sweep is expensive

## External Sources

- Birdeye Token List docs: https://docs.birdeye.so/reference/get-defi-v3-token-list
- Birdeye Meme Token List docs: https://docs.birdeye.so/reference/get-defi-v3-token-meme-list
- Birdeye changelog 2026-02-10: https://docs.birdeye.so/changelog/20260210-release-extra-intervals-for-token-meme-list
