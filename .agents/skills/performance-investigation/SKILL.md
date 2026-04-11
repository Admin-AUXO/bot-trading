---
name: "performance-investigation"
description: "Use for latency, throughput, cost, or resource investigations across backend loops, database, provider calls, and dashboard layers."
---

# Performance Investigation

## Use When

- the task is about latency, throughput, cost, or waste

## Read First

- `notes/README.md`
- the one runtime, API, schema, or dashboard note that matches the hotspot

## Rules

- Measure before changing anything.
- Trace the hottest path first.
- Separate CPU, IO, DB, provider, browser, and interval-loop bottlenecks.
- Treat provider credit burn as part of the performance budget.
- Prefer batching, caching, dedupe, and shared-service fixes before frequency increases.
