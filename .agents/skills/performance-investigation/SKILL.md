---
name: "performance-investigation"
description: "Use for latency, throughput, cost, or resource investigations across backend runtime loops, database, provider calls, and dashboard layers."
---

# Performance Investigation

Use this skill for latency, throughput, or resource problems.

## Workflow

- Before tracing code, read `docs/README.md` plus the relevant runtime, API, or schema docs for the hotspot.
- Measure before changing anything.
- Trace the hottest path first.
- Separate CPU, IO, DB, provider, browser, and interval-loop bottlenecks.
- Question duplicate polling, repeated provider reads, and oversized page fetches before increasing cadence.
- Treat Birdeye monthly pace, lane budgets, and off-hours dayparting as first-class constraints, not “ops details.”
- Prefer batching, caching, dedupe, and shared-service fixes before increasing scan frequency or concurrency.
- Use endpoint-level evidence before blaming “the network.”
- Say explicitly when the repo lacks the historical data needed to prove a claim.
- If the fix changes runtime behavior or operator guidance, update the matching docs in the same pass.
