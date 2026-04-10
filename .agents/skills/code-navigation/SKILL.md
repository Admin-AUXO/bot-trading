---
name: "code-navigation"
description: "Use for evidence-first repo exploration: trace entry points, execution paths, ownership boundaries, and impacted files before proposing edits."
---

# Code Navigation

Use this skill when the main job is understanding the codebase, not editing it yet.

## Workflow

- Start from the runtime, route, page, or command that actually executes the behavior.
- Prefer symbol tracing and narrow file reads over dumping whole directories.
- Follow proxy, auth, schema, provider, and scheduler boundaries end to end when they matter.
- Identify the smallest file set that owns the behavior.
- Note side effects, persistence, and external calls before discussing fixes.

## Output

- Entry points.
- Important symbols and files.
- Dependencies and side effects.
- Edit or review risk areas.
