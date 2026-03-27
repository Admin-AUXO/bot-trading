---
name: "performance-investigation"
description: "Workflow for identifying bottlenecks across backend, database, queue, and dashboard layers with measurement-first reasoning and targeted fixes."
---

# Performance Investigation

Use this skill for latency, throughput, or resource issues.

## Goals
- Measure before changing.
- Trace the hottest path first.
- Distinguish CPU, IO, DB, queue, and browser bottlenecks.
- Prefer the smallest change with measurable impact.

## Preferred Tools
- `serena` and `filesystem` for tracing hot paths.
- `chrome_devtools` for frontend performance.
- `postgres` for expensive read-path inspection when available.
- `sequential_thinking` for multi-layer bottlenecks.
