---
name: smart-money-watcher
description: Use when curating the SmartWallet registry, wiring Helius webhook plumbing, ingesting SmartWalletEvent, or shipping the SMART_MONEY_RUNNER pack.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Smart-Money Watcher

## Use when

- curating / re-ranking the `SmartWallet` registry
- creating, updating, or deleting Helius enhanced webhooks for wallet cohorts
- editing the `/webhooks/helius/smart-wallet` handler or `SmartWalletEvent` ingestion
- building the `v_smart_wallet_mint_activity` rollup
- shipping pack 2 (`SMART_MONEY_RUNNER`) filters, entry score bump, or exit wiring

## Read first

- `draft_backend_plan.md` §5 — Smart-Money build instructions (wallet curation → webhook → aggregation → entry → exit → rollout gates)
- `draft_strategy_packs_v2.md` §B.1 pack 2 — filters, sort column, exits, capital modifier
- `draft_database_plan.md` §1 — `SmartWallet`, `SmartWalletEvent` shape
- Helius guide via MCP: `getWebhookGuide`, `recommendStack`

## Rules

- Curate from Cielo top-PnL + Birdeye gainers/losers + Helius `getWalletIdentity` batch on prior-winner top-holders. Filter on ≥$50 k realized PnL 30 d, WR ≥55 %, ≥10 distinct mints, last-active ≤48 h.
- Cap: **60 wallets / 3 webhooks**, ≤25 addresses per webhook. Dashboard warns if `getAllWebhooks` drifts above cap.
- Webhook: `createWebhook({ transactionTypes:['SWAP'], webhookType:'enhanced', txnStatus:'success' })`. Signature verification required on the handler.
- Signal: ≥2 distinct tracked wallets buy the same mint within 15 min, net flow ≥$3 k, no prior tracked-sell within 30 min.
- Entry score bump: `+0.08`. Base filters: liq ≥$25 k, MC ≤$15 M, holders ≥100, mint+freeze renounced.
- Capital modifier: 1.4×. SL 13 % / TP1 1.40× / TP2 2.20×.
- Exit live-mutator: ≥2 tracked sells within 90 s and realized PnL >+10 % → TP1. Net sell USD > entry-time net buy USD → full exit.
- Rollout gates: 7 days ingestion <1 % dropped-tx → TESTING; 48 h sandbox ≥10 triggered candidates → GRADED; grade ≥B + WR ≥48 % → LIVE.
- Re-rank wallets weekly; auto-retire WR <30 % or zero activity 14 d.

## Failure modes

- Exceeding webhook cap → Helius rate-limits the entire service, not just this pack.
- Skipping signature verification on the handler → spoofed events write to `SmartWalletEvent`.
- Missing idempotency on `txSig` → double-counted signals.
- Ingesting sells without the 30-min no-tracked-sell guard → false positives on momentum exits.
- Promoting pack to LIVE without the 7-day clean ingestion gate.
