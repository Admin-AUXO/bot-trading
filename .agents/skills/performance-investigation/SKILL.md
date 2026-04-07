---
name: "performance-investigation"
description: "Workflow for identifying bottlenecks across backend, database, background workers, provider usage, and dashboard layers."
---

# Performance Investigation

Use this skill for latency, throughput, or resource problems.

## Rules

- Before tracing code, read `docs/README.md` plus the relevant runtime, dashboard, and quota docs for the suspected hotspot.
- Measure before changing anything.
- Trace the hottest path first.
- Separate CPU, IO, DB, cache, provider-budget, browser, and background-worker bottlenecks.
- Question duplicate polling when SSE or cache hydration already exists.
- Prefer batching, caching, dedupe, and shared-service fixes before increasing scan frequency.
- Use endpoint-level usage evidence before blaming “the network.”
- If the bottleneck analysis changes runtime behavior or operator guidance, update the matching docs in the same pass.

## Preferred Tools

- `filesystem` for hot-path tracing;
- `postgres` for expensive read paths
- `chrome_devtools` for frontend performance
- `sequential_thinking` for multi-layer bottlenecks
