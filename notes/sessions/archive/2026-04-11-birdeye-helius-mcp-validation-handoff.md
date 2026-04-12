---
type: session
status: closed
area: providers/mcp
date: 2026-04-11
source_files:
  - .codex/config.toml (user-level)
  - trading_bot/backend/.env
  - notes/trading-memory/providers/2026-04-11-birdeye-discovery-endpoint-selection.md
  - notes/trading-memory/providers/2026-04-11-birdeye-meme-list-filter-limit.md
graph_checked: 2026-04-11
next_action: Use the secondary Birdeye recent_listing_time rotation only if wider recall is needed; the primary MCP validation and Helius enrichment pass are complete.
---

# Session - Birdeye And Helius MCP Validation

## Context

This repo now has both Birdeye and Helius MCP server entries added to the user-level `.codex/config.toml`.

What was already done in this session:

- added `birdeye-mcp` via `mcp-remote` against `https://mcp.birdeye.so/mcp`
- added `helius` via `npx -y helius-mcp@latest`
- wired both MCP entries to the existing API keys from `trading_bot/backend/.env`
- confirmed from shell that `codex mcp list` shows both `birdeye-mcp` and `helius` as `enabled`
- fixed host login-shell Python so `python3` now resolves to Homebrew Python `3.13.13`

Important nuance:

- this chat session will not magically refresh its tool registry after MCP config edits
- the next agent should start a fresh Codex session before testing the new MCP setup directly

## What Changed

Config file updated:

- `.codex/config.toml` (user-level)

Related durable notes:

- [Birdeye Discovery Endpoint Selection](../trading-memory/providers/2026-04-11-birdeye-discovery-endpoint-selection.md)
- [Birdeye Meme List Filter Limit](../trading-memory/providers/2026-04-11-birdeye-meme-list-filter-limit.md)

## Rules

- Do not use `token/list`. The user explicitly does not want it.
- For Birdeye discovery validation, use `meme/list` only.
- Keep chain scope to Solana only.
- Do not waste time re-adding MCP config unless a fresh session proves the servers are still missing.
- Do not print or copy API keys into notes, chat, logs, or screenshots.
- Prefer MCP-native calls once the fresh session exposes them. Only fall back to raw HTTP if the fresh session still does not expose Birdeye MCP tools after restart.
- Avoid repeated high-cost discovery calls. One or two Birdeye smoke tests are enough.
- Keep Birdeye `meme/list` request filters at five or fewer concurrent API-side filters. The repo already observed provider-side failure at six filters.

## Birdeye Discovery Contract

The user does not want `token/list`. Stick with `meme/list`.

Primary discovery validation request:

- chain/header: `solana`
- endpoint family: `GET /defi/v3/token/meme/list`
- `source=all`
- `graduated=true`
- `sort_by=graduated_time`
- `sort_type=desc`
- `min_graduated_time=now-86400`
- `min_last_trade_unix_time=now-3600`
- `min_liquidity=5000`
- `limit=100`

Secondary rotation request if needed:

- same endpoint and Solana scope
- same `source=all`
- same `graduated=true`
- `sort_by=recent_listing_time`
- `sort_type=desc`
- same `min_graduated_time`
- same `min_last_trade_unix_time`
- same `min_liquidity`
- `limit=100`

Local post-filters are preferred over extra provider filters:

- minimum holders
- tighter volume floors
- tighter trade-count floors

Reason:

- `meme/list` has graduation-native fields like `source`, `graduated`, `graduated_time`, `creation_time`, and `progress_percent`
- `token/list` is broader but worse for graduation-play discovery
- the repo already recorded that `meme/list` can fail with `400 Maximum 5 concurrently filters` when over-filtered

## Helius Validation Contract

Use Helius MCP directly in the fresh session. Keep the tests cheap and non-destructive.

Recommended order:

1. `getStarted`
2. `getAccountStatus`
3. `getNetworkStatus`

Why this order:

- `getStarted` confirms setup expectations
- `getAccountStatus` confirms auth state for the configured API key
- `getNetworkStatus` proves live RPC-backed calls work

Do not do anything wallet-mutating:

- no transfers
- no webhooks
- no plan upgrades
- no account signup flow

## Exact Task For The Next Agent

1. Start a fresh Codex session from repo root
2. Confirm the session can see the refreshed MCP setup
3. Verify Birdeye MCP is callable in that fresh session
4. Run one Birdeye credits or lightweight smoke test if the tool set exposes it
5. Run one Birdeye `meme/list` discovery validation with the primary filter set above
6. Confirm the response contains graduated Solana meme tokens with expected discovery fields like source, graduation time, recent listing time, liquidity, and last trade time
7. Verify Helius MCP is callable in that fresh session
8. Run `getStarted`
9. Run `getAccountStatus`
10. Run `getNetworkStatus`
11. Summarize whether both MCP servers are usable directly from the fresh session without fallback
12. If Birdeye MCP still fails to surface in the fresh session, capture the exact failure mode before touching config again

## Acceptance Criteria

- a fresh Codex session can use Birdeye MCP directly
- a fresh Codex session can use Helius MCP directly
- Birdeye validation uses `meme/list`, not `token/list`
- Birdeye response confirms Solana graduated meme-token discovery works with the specified filters
- Helius response confirms configured auth and live network calls work
- the next agent reports exact failure details if either MCP is missing or broken instead of vaguely saying "not working"

## Validation Outcome

- Birdeye MCP server is live and authenticated. The app tool registry in this thread still did not hot-reload Birdeye into first-class tools, but the configured MCP server worked over stdio with JSON-line framing through the local `mcp-remote` wrapper.
- Birdeye credits smoke test succeeded via `get-utils-v1-credits`.
  Usage window: `2026-04-07T22:53:42Z` to `2026-05-07T22:53:42Z`
  `usage.total=56002`, `usage.api=56002`, `usage.ws=0`, `remaining.total=1443998`, `overage_usage.total=0`
- Birdeye `get-defi-v3-token-meme-list` succeeded with the primary Solana filter set:
  `source=all`, `graduated=true`, `sort_by=graduated_time`, `sort_type=desc`, `min_graduated_time=now-86400`, `min_last_trade_unix_time=now-3600`, `min_liquidity=5000`, `limit=100`
- The Birdeye response returned `100` items with `has_next=true` and included the expected graduation-native fields:
  `meme_info.source`, `meme_info.graduated_time`, `recent_listing_time`, `liquidity`, `last_trade_unix_time`, `holder`, `volume_1h_usd`
- Helius MCP validation succeeded.
  `getStarted` reported the API key as ready.
  `getAccountStatus` reported authenticated API-key access, but plan credit usage was unavailable because there was no JWT session.
  `getNetworkStatus` returned live Solana network data at validation time, including epoch `954`, absolute slot `412428341`, block height `390526150`, and cluster version `3.1.13`.

## Token Grading Snapshot

Helius was used to grade the best Birdeye candidates from the live response instead of trusting raw momentum alone.

What Helius added:

- all ten shortlisted mints resolved as initialized `spl-token-2022` mint accounts
- all ten had `mintAuthority=null`
- all ten had `freezeAuthority=null`
- all ten had token metadata `updateAuthority=null`
- all ten creator wallets resolved as `Unknown`, so there was no known-entity credibility lift
- holder concentration looked healthy rather than obviously insider-choked; the worst top-holder share in the shortlisted set was still modest (`PND` top1 about `1.58%`, top5 about `3.11%`)

Shortlist after Birdeye flow plus Helius structure checks:

- `A` `SNIGGA` (`7c5gm5fqvQuyteJ9G4pFaubqRVHuegsFXtfHJXBBpump`)
  Best live tape in the batch: about `$309k` liquidity, `$480k` 1h volume, `9512` holders, `16183` unique wallets. Structurally clean on Helius.
- `A-` `Loot` (`BJioMoLiUhHma1zagiVfoJEDfUkboa4DV1YrWU48pump`)
  Strong breadth and flow: about `$95k` liquidity, `$192k` 1h volume, `3779` holders, `8442` unique wallets. Sharp 1h pullback kept it below the top slot.
- `A-` `TRUE` (`GBjRHbuTzJF2qMkemwY9uWhvs8r9uYqL4bxKheEtpump`)
  Very strong activity: about `$58k` liquidity, `$379k` 1h volume, `17779` 1h trades. Also one of the cleaner Helius concentration profiles, but the `-47%` 1h move makes it more reversal-prone than the rank alone suggests.
- `B+` `Peepa` (`EamB9vqC1b4aoyPR6t3hn6CWf48yny84xzCuFJMbpump`)
  Good breadth and acceptable liquidity: about `$48k` liquidity, `$223k` 1h volume, `2655` holders. Structurally clean, but still in a pullback state.
- `B+` `emi` (`EQUU2gdzvmabX36rCxKSRSNJKtAedRHEiP8pikC8pump`)
  Very fresh graduate with strong tape: about `$35k` liquidity, `$314k` 1h volume, `8090` 1h trades. Helius structure is clean, but the token is only about `57` minutes post-graduation and already up hard, so this is momentum risk, not comfort.
- `B` `HAHA` (`6DUdwjXtqJKrNFQBQzsaPW7pP2EZg2hbQ92NBi9Ppump`)
  Balanced profile: about `$49k` liquidity, `$102k` 1h volume, `2089` holders, flat 1h price action. Cleaner than the average pump graduate and less stretched than the mania names.
- `B` `Skibidi` (`FFvp48WygUSxCCNP3n9Zu5G7F2yatwXQHbpD2Mkkpump`)
  Strong recent activity with structurally clean Helius flags, but distribution is a bit tighter and the tape is still hype-heavy.
- `B` `NGOGO` (`FzaCYkfFyTYUN2whdXzBC4LX5gFuzL2yPFTnrGDKr5xj`)
  Older graduate with decent liquidity and broad holder count. Lower 1h volume than the top names, which makes it more stable-looking but less explosive.
- `B-` `MATT` (`2PXZ2Q55YNttMiZ2e4owrAjoevFAwkKSqYy6D6cGpump`)
  Reasonable structure and decent flow, but weaker trade intensity than the tokens above it.
- `B-` `PND` (`5NmLAtsnwiZZbidywsSZYbZS3GtsoAEfa9HNHjGspump`)
  Freshest serious mover in the top ten with about `$158k` 1h volume, but only `577` holders and the highest concentration in the shortlist. Still structurally clean, just less mature.

## Time Savers

- `codex mcp list` already showed both `birdeye-mcp` and `helius` as `enabled` after the config edit in this session
- the current thread is the wrong place to judge refreshed MCP availability because tool registries do not hot-reload here
- do not spend time debugging Apple Python; that was already fixed for login shells
- do not revisit `token/list` vs `meme/list`; that decision is already made for this task

## Risks / Unknowns

- this thread still did not hot-reload Birdeye MCP into first-class app tools, so direct shell-side stdio probing was required even though the configured server itself worked
- `getAccountStatus` remains incomplete until a JWT-backed Helius session exists; API-key auth alone was enough for live calls but not for plan-credit reporting
- the token grades are a live snapshot built from one Birdeye discovery page plus same-session Helius enrichment, not a persistence study across multiple rotations

## Next Action

Use the secondary `recent_listing_time desc` Birdeye rotation only if the desk wants a wider recall pass. For quality grading, keep using Helius mint-authority and holder-concentration checks on the shortlisted names instead of treating raw Birdeye momentum as sufficient.

## Durable Notes Updated

- [Birdeye Discovery Endpoint Selection](../trading-memory/providers/2026-04-11-birdeye-discovery-endpoint-selection.md)
- [Birdeye Meme List Filter Limit](../trading-memory/providers/2026-04-11-birdeye-meme-list-filter-limit.md)
