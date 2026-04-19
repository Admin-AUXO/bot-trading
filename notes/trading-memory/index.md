---
type: trading-memory
status: active
area: trading
date: 2026-04-10
source_files: []
graph_checked:
next_action:
---

# Trading Memory

This is the durable desk memory layer. Use it to store what the code will not tell you by itself.

## Best Uses

- Provider quirks, quotas, latency behavior, and failure modes
- Strategy observations that changed threshold tuning or lane pacing
- Execution surprises, landing problems, and wallet safety lessons
- Market-regime notes that affect discovery quality or exit behavior
- Repeatable false positives and why the filter stack let them through
- Operator heuristics that are valid enough to reuse but not yet strong enough to hard-code

## Structure

- [`providers/`](providers/)
- [`strategy/`](strategy/)
- [`execution/`](execution/)
- [`market/`](market/)

## Rule

If a trading fact would save a future session from repeating an expensive mistake, store it here.
