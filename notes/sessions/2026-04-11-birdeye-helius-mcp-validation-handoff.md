---
type: session
status: open
area: providers/mcp
date: 2026-04-11
source_files:
  - /Users/rukaiyahyusuf/.codex/config.toml
  - trading_bot/backend/.env
  - notes/trading-memory/providers/2026-04-11-birdeye-discovery-endpoint-selection.md
  - notes/trading-memory/providers/2026-04-11-birdeye-meme-list-filter-limit.md
graph_checked: 2026-04-11
next_action: Start a fresh Codex session and validate one live Birdeye MCP call plus one live Helius MCP call without using token/list.
---

# Session - Birdeye And Helius MCP Validation Handoff

## Context

This repo now has both Birdeye and Helius MCP server entries added to `/Users/rukaiyahyusuf/.codex/config.toml`.

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

- [`/Users/rukaiyahyusuf/.codex/config.toml`](/Users/rukaiyahyusuf/.codex/config.toml:42)

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

1. Start a fresh Codex session from repo root: `/Users/rukaiyahyusuf/Downloads/bot-trading`
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

## Time Savers

- `codex mcp list` already showed both `birdeye-mcp` and `helius` as `enabled` after the config edit in this session
- the current thread is the wrong place to judge refreshed MCP availability because tool registries do not hot-reload here
- do not spend time debugging Apple Python; that was already fixed for login shells
- do not revisit `token/list` vs `meme/list`; that decision is already made for this task

## Risks / Unknowns

- Birdeye MCP tool naming in the fresh session may differ from the raw REST endpoint names
- Birdeye remote MCP availability still depends on fresh-session tool registration, not just `config.toml`
- Helius MCP should be easier because the server package is local and already visible from shell config, but the next agent still needs to prove live call success from the fresh session

## Next Action

Open a fresh Codex session and execute the exact validation sequence above without drifting into `token/list` or reworking solved config.

## Durable Notes Updated

- [Birdeye Discovery Endpoint Selection](../trading-memory/providers/2026-04-11-birdeye-discovery-endpoint-selection.md)
- [Birdeye Meme List Filter Limit](../trading-memory/providers/2026-04-11-birdeye-meme-list-filter-limit.md)
