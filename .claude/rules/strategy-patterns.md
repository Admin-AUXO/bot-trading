# Strategy & Core Logic Patterns

## Position & Trade Source
- `tradeSource: "AUTO"` — bot-initiated (default)
- `tradeSource: "MANUAL"` — user-initiated from dashboard
- Manual positions excluded from `openCount()` and `countByStrategy()` — don't consume the 5-slot limit
- Manual trades still must write to DB and pass through trade executor (not bypassed)

## Risk Manager Contract
- `canOpenPosition(strategy)` → `{ allowed: boolean, reason?: string }`
- Reason `"max 5 open positions reached"` triggers skipped signal persistence in `trade-executor.ts`
- `reservePosition` / `releasePosition` must be called in matched pairs — `finally` block pattern
- Manual trades skip `canOpenPosition` check but still call `riskManager.getPositionSize`

## Skipped Signal Persistence
- Captured in `trade-executor.ts` (not strategies) — single capture point for all 3 strategies
- Saved as `Signal` with `passed: false`, `rejectReason: "MAX_POSITIONS"`
- Include market context: `regime`, `tokenLiquidity`, `tokenMcap`, `tokenVolume5m`, `buyPressure`, `priceAtSignal`
- Use `.catch(() => {})` on the DB write — skipped signal logging must never throw and block execution

## Exit Logic
- Tranche detection: `exit1Done ? (exit2Done ? 3 : 2) : 1`
- Manual exit: `exitReason: "MANUAL"`, `tradeSource: "MANUAL"`, sell `position.remainingToken`
- Never retry exit — see solana-api-patterns.md

## Regime Awareness
- Strategies check regime before opening positions — RISK-OFF = no new entries
- Market regime: HOT / NORMAL / CHOPPY / RISK-OFF
- Regime detector updates on each `MarketTick` snapshot (5-min intervals)

## Strategy-Specific Constants
| Strategy | Max Positions | Position Size | Stop Loss | Time Stop |
|----------|--------------|---------------|-----------|-----------|
| S1_COPY | 2 | 20% | 20% | 2h (no +10%) |
| S2_GRADUATION | 2 | 20% | 25% | 15m (no +10%) |
| S3_MOMENTUM | 3 | 10% | 10% | 5m (no +5%) |

## Exit Targets
| Strategy | Exit 1 | Exit 2 | Exit 3 |
|----------|--------|--------|--------|
| S1_COPY | +30% (50%) | +60% (25%) | Trailing |
| S2_GRADUATION | 2x (50%) | 3-4x (30%) | Trailing |
| S3_MOMENTUM | +20% (50%) | +40% (25%) | Trailing |

## Position Tracker
- In-memory store of open positions — source of truth for active positions
- Loaded from DB on startup — must stay in sync with DB writes
- `getById(id)` for manual operations — returns `null` if already closed
- `tradeSource` field on `PositionState` — used to exclude manuals from slot count

## Stats Aggregator
- Runs in a dedicated worker thread — not in main process
- Writes to `DailyStats` table — upsert pattern by date
- Triggered on trade close and on schedule — not on every tick
