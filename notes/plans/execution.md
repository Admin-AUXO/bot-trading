# Execution Plan — Quote, Submit, Confirm

Companion to [backend.md](backend.md) and [implementation-plan.md](implementation-plan.md). Snapshot **2026-04-19**.

The repo already has a custom execution stack because it needs Solana lane control. The plan is to harden that path, not replace it with another abstraction.

## Current stack

- Quote: `services/execution/quote-builder.ts`
- Build: `services/execution/swap-builder.ts`
- Submit and retry: `services/execution/swap-submitter.ts`
- Orchestration: `services/live-trade-executor.ts`
- Fee estimation: `services/helius/priority-fee-service.ts`
- Current runtime reality: `LiveTradeExecutor` still passes `lane: 'REGULAR'` into `SwapSubmitter`; `SwapSubmitter` is not yet the policy owner for lane choice.

## External guidance applied

- Jupiter now exposes a simpler managed path (`/order` + `/execute`) and a custom transaction path (`/build`). This bot should stay on the custom path only because it needs custom lane, fee, and sender control.
- Solana mainnet guidance treats fresh blockhash, `lastValidBlockHeight`, and caller-owned retries as required execution state.
- Solana `sendTransaction` acceptance is not confirmation; confirmation state must be checked separately and the commitment target must be explicit.
- Helius Sender requires tips, priority fees, and `skipPreflight: true` when that lane is chosen.
- Helius recommends serialized-transaction fee estimation for the most accurate priority fee quote.

## Landing contract

- Submission accepted by RPC or Sender is not a successful trade.
- Every live send path must define which confirmation level it waits for and where that check happens.
- Priority fee policy should follow compute-unit policy, not hardcoded flat fee guesses.
- Use production RPC/Sender infrastructure for the live path; do not treat public RPC behavior as the contract.

## Hard requirements

### 1. Quote freshness is explicit

- Reject stale quotes before submission.
- Re-quote instead of sending a stale transaction.
- Keep the freshness rule in `SwapSubmitter`, not scattered across callers.

### 2. Blockhash expiry is explicit

- Track `lastValidBlockHeight`.
- Own retries in our code, not by leaning on blind RPC retries.
- Stop retrying when the transaction is expired.
- Make the confirmation target explicit for each workflow that waits on landed state.

### 3. Fee and tip policy is explicit

- All priority-fee lookups go through `HeliusPriorityFeeService`.
- If `HELIUS_SENDER` is selected, the transaction must already include the required tip and priority-fee instructions.
- Clamp or fall back in one place, with telemetry.

### 4. Lane policy is proven from code

- Do not publish or preserve a detailed lane matrix until runtime stops hardcoding `REGULAR`.
- Either add a real upstream lane-selection seam or keep the doc focused on the current single-lane behavior.
- Keep `FillAttempt` as the per-attempt ledger for landed and failed sends.

## Implementation order

### A. Prove current lane selection

**Files**
- `trading_bot/backend/src/services/execution/swap-submitter.ts`
- lane-selection tests

**Acceptance**
- The docs describe the policy the code really uses.
- We do not preserve speculative lane tables that no longer match the implementation.
- If lane selection is still upstream and forced, say that plainly.

### B. Harden freshness and expiry

**Files**
- `quote-builder.ts`
- `swap-submitter.ts`
- `live-trade-executor.ts`

**Acceptance**
- Quote age and blockhash expiry produce stable failure reasons.
- Retry behavior is deterministic and testable.
- The code makes it obvious where confirmation is checked and what commitment it expects.

### C. Harden fee estimation and Sender requirements

**Files**
- `priority-fee-service.ts`
- `swap-submitter.ts`

**Acceptance**
- Serialized-transaction fee estimation is the default input where possible.
- Sender submissions always satisfy tip + priority-fee + preflight requirements.

### D. Run soak only after tests pass

**Acceptance**
- One paper soak note is useful only after unit and integration proof land.
- Do not use the soak as a substitute for lane, expiry, or fee tests.

## Minimum tests

- lane selection
- stale quote rejection
- priority-fee clamp/fallback
- blockhash-expiry stop condition
- `FillAttempt` write for failed and successful sends

## Done when

- The live path is easy to explain: quote, build, submit, confirm.
- The retry policy follows current Solana guidance instead of RPC defaults.
- The docs no longer promise a lane matrix that the code has not proved.
