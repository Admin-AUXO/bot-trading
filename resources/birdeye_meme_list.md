# Birdeye Meme Token List

Lean reference for Birdeye's meme-token list endpoint.

## Endpoint

- Method: `GET`
- URL: `https://public-api.birdeye.so/defi/v3/token/meme/list`
- Auth: header `X-API-KEY`
- Upstream ref: [Meme Token - List](https://docs.birdeye.so/reference/get-defi-v3-token-meme-list#/)

## Access

- Plans: Lite, Starter, Premium, Business, Enterprise
- Chains via `x-chain`: `solana`, `bsc`, `monad`
- CU cost: 100, per [birdeye_credit.md](./birdeye_credit.md)

## What It Returns

Returns a paginated list of meme tokens with basic market and activity fields, including:

- token identity: `name`, `symbol`, `address`, `logo_uri`, `decimals`
- market fields: `price`, `market_cap`, `fdv`, `liquidity`
- activity windows: volume, trade counts, buy/sell counts, unique wallets
- holder count and recent listing time
- `meme_info` with creator, source, platform, pool, progress, and graduation state

## Required Query Params

- `sort_by`: field to sort on
- `sort_type`: `desc` or `asc` with default `desc`

Default `sort_by` is `progress_percent`.

## High-Value Optional Filters

Identity and platform:

- `source`
- `creator`
- `platform_id`
- `graduated`
- `x-chain` header

Pagination:

- `offset`: default `0`
- `limit`: default `100`
- Constraint: `offset + limit <= 10000`

Lifecycle windows:

- `min_creation_time`, `max_creation_time`
- `min_graduated_time`, `max_graduated_time`
- `min_recent_listing_time`, `max_recent_listing_time`
- `min_last_trade_unix_time`, `max_last_trade_unix_time`
- `min_progress_percent`, `max_progress_percent`

Liquidity and valuation:

- `min_liquidity`, `max_liquidity`
- `min_market_cap`, `max_market_cap`
- `min_fdv`, `max_fdv`
- `min_holder`

Activity thresholds:

- volume floors across `1m`, `5m`, `30m`, `1h`, `2h`, `4h`, `8h`, `24h`, `7d`, `30d`
- volume change floors across the same windows
- price change floors across `1m`, `5m`, `30m`, `1h`, `2h`, `4h`, `8h`, `24h`, `7d`, `30d`
- trade count floors across `1m`, `5m`, `30m`, `1h`, `2h`, `4h`, `8h`, `24h`, `7d`, `30d`

## `source` Values

- `all`
- `pump_dot_fun`
- `moonshot`
- `raydium_launchlab`
- `meteora_dynamic_bonding_curve`
- `four.meme`
- `nad.fun`
- `flap`
- `something`
- `lfj_token_mill`

## `sort_by` Values

Lifecycle:

- `progress_percent`
- `graduated_time`
- `creation_time`
- `recent_listing_time`
- `last_trade_unix_time`

Market size:

- `liquidity`
- `market_cap`
- `fdv`
- `holder`

Volume:

- `volume_1m_usd`
- `volume_5m_usd`
- `volume_30m_usd`
- `volume_1h_usd`
- `volume_2h_usd`
- `volume_4h_usd`
- `volume_8h_usd`
- `volume_24h_usd`
- `volume_7d_usd`
- `volume_30d_usd`

Volume change:

- `volume_1m_change_percent`
- `volume_5m_change_percent`
- `volume_30m_change_percent`
- `volume_1h_change_percent`
- `volume_2h_change_percent`
- `volume_4h_change_percent`
- `volume_8h_change_percent`
- `volume_24h_change_percent`
- `volume_7d_change_percent`
- `volume_30d_change_percent`

Price change:

- `price_change_1m_percent`
- `price_change_5m_percent`
- `price_change_30m_percent`
- `price_change_1h_percent`
- `price_change_2h_percent`
- `price_change_4h_percent`
- `price_change_8h_percent`
- `price_change_24h_percent`
- `price_change_7d_percent`
- `price_change_30d_percent`

Trade count:

- `trade_1m_count`
- `trade_5m_count`
- `trade_30m_count`
- `trade_1h_count`
- `trade_2h_count`
- `trade_4h_count`
- `trade_8h_count`
- `trade_24h_count`
- `trade_7d_count`
- `trade_30d_count`

## Data Availability Notes

- `pump_dot_fun`, `moonshot`, `raydium_launchlab`: from `2025-06-20`
- `meteora_dynamic_bonding_curve`: from `2025-09-20`
- `four.meme`: from `2025-11-20`
- `nad.fun`: from `2025-11-17`

## Response Shape

Successful responses follow this shape:

```json
{
  "success": true,
  "data": {
    "items": [],
    "has_next": true
  }
}
```

Error responses use standard Birdeye status handling:

- `400`: bad request
- `401`: missing or invalid API key
- `403`: blocked or not whitelisted
- `429`: rate limited
- `500`: internal server error

## Minimal Example

```bash
curl --request GET \
  --url 'https://public-api.birdeye.so/defi/v3/token/meme/list?sort_by=progress_percent&sort_type=desc&limit=50' \
  --header 'X-API-KEY: YOUR_API_KEY' \
  --header 'x-chain: solana'
```

## When To Use It

Use this endpoint when you need broad candidate discovery across meme-token venues. If you already know the token and need detail, use the single-token meme detail endpoint instead of scanning this list.
