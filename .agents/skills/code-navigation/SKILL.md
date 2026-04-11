---
name: "code-navigation"
description: "Use for evidence-first repo exploration: trace entry points, execution paths, ownership boundaries, and impacted files before editing."
---

# Code Navigation

## Use When

- the main job is understanding the codebase
- the fix depends on tracing the real execution path first

## Rules

- Start from the runtime, route, page, command, or cron path that actually executes the behavior.
- Prefer symbol tracing and narrow reads over directory dumps.
- Follow auth, provider, schema, proxy, and scheduler boundaries when they matter.
- Identify the smallest file set that truly owns the behavior.

## Deliverable

- entry points
- owning files and symbols
- important side effects
- likely edit risk areas
