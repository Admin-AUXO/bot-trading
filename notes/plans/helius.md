# Helius Plan — Admin, Idempotency, Smart Wallets

Companion to [backend.md](backend.md), [execution.md](execution.md), and [implementation-plan.md](implementation-plan.md). Snapshot **2026-04-19**.

Helius is already part of the live trading path through priority fees, Sender, and webhook ingest. The remaining work is ownership cleanup, not more surface area.

## Current owner seams

- `HeliusPriorityFeeService` for fee estimation
- `HeliusWatchService` for webhook ingest, replay suppression, and watch-related logic
- `HeliusClient` as the thin RPC/API wrapper

## External guidance applied

- Helius Sender is valid for the low-latency lane, but only when the transaction already includes the required tip, priority fee, and `skipPreflight: true`.
- Helius webhooks can retry and deliver duplicates; idempotent ingest is part of the baseline contract.
- Helius exposes create/get/list/update/delete webhook APIs, so operator admin should live in one backend seam instead of manual dashboard setup.

## Priorities

### 1. Webhook admin and reconcile

**Files**
- `trading_bot/backend/src/services/helius/helius-watch-service.ts`
- one Helius admin route file

**Acceptance**
- Webhook handlers acknowledge quickly and offload slower work.
- The backend can list active webhooks and clean up drift.
- Reconcile logic does not break replay dedupe.
- Manual dashboard-only provisioning is no longer the only operating mode.

### 2. Keep webhook ingest idempotent

**Acceptance**
- Replay suppression stays covered by tests anywhere webhook ownership changes.
- Duplicate delivery is handled as normal behavior, not an exception path.
- Failure and auto-disable recovery are considered in the operating checklist.

### 3. Centralize smart-wallet readiness

**Files**
- `helius-watch-service.ts`
- session or pack-deployment seam that actually controls LIVE enablement

**Acceptance**
- Any 7-day clean-ingest rule lives near the real LIVE deployment path, not in the UI and not in a fictional status setter.
- Smart-wallet readiness is queryable from one backend owner.

### 4. Only centralize websockets when there is a real shared consumer

**Acceptance**
- Do not add a big websocket abstraction just because it sounds cleaner.
- Centralize only if `ExitEngine`, enrichment, and watch logic truly need the same connection owner.

### 5. Keep creator-lineage work budget-gated

**Acceptance**
- Background lineage loads stay behind `ProviderBudgetService`.
- Candidate evaluation does not block on a slow creator-lineage call.

## Minimum tests

- webhook signature or auth verification
- replay dedupe
- admin reconcile/list behavior
- smart-wallet readiness gate if that rule changes

## Done when

- Helius webhook ownership is visible and testable from one backend seam.
- The docs stop treating manual provisioning as acceptable steady state.
- Smart-wallet readiness and creator-lineage work stay tied to real trading needs.
