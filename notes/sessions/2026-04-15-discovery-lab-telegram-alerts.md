---
type: session
status: active
area: automation
date: 2026-04-15
source_files:
  - trading_bot/backend/package.json
  - trading_bot/backend/.env.example
  - trading_bot/backend/scripts/discovery-lab-telegram-alert.ts
  - notes/runbooks/2026-04-11-birdeye-discovery-lab.md
  - notes/reference/bootstrap-and-docker.md
graph_checked:
next_action: Confirm the created Codex heartbeat automation is using the new runner and that the local backend plus Telegram secrets are reachable in the automation environment.
---

# Session - Discovery Lab Telegram Alerts

## Findings / Decisions

- The repo had a supported recurring discovery-lab surface through the existing backend API and persisted run history, but no Telegram notifier.
- The narrowest implementation was a repo-owned runner script instead of modifying discovery-lab runtime contracts or adding Telegram logic throughout the backend.
- Telegram delivery stays low-noise: only winner-positive completed runs for `Scalp tape + structure` trigger a message.

## What Changed

- Added `npm run lab:telegram-alert` in `trading_bot/backend`.
- Added `trading_bot/backend/scripts/discovery-lab-telegram-alert.ts` to:
  - self-gate on `7:00 PM IST` to `1:30 AM IST`
  - skip when another discovery-lab run is already active
  - start the fixed saved pack `scalp-tape-structure` through the backend API
  - poll until completion
  - send a compact Telegram message only when winners exist
- Added `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` placeholders to `trading_bot/backend/.env.example`.
- Updated the owned discovery-lab runbook and bootstrap reference so setup and operator expectations mention the Telegram alert runner.

## What I Verified

- `cd trading_bot/backend && npm run typecheck`
- mocked local end-to-end runner check against a fake backend API plus fake Telegram API

## Remaining Risks

- The Codex heartbeat automation still depends on the local backend being up and reachable at the configured API URL when it fires.
- Telegram delivery errors are intentionally surfaced in the automation trace instead of being retried through a queueing layer.
