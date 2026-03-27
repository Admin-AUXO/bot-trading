---
name: "code-navigation"
description: "Evidence-first codebase navigation workflow for tracing symbols, execution paths, ownership, and affected files without drifting into implementation."
---

# Code Navigation

Use this skill to explore the repo before proposing changes.

## Goals
- Trace the real execution path.
- Prefer symbol-aware navigation over broad file dumping.
- Identify the smallest set of files that matter.
- Report concrete evidence with file paths and symbol names.

## Preferred Tools
- `serena` for semantic symbol lookup and code relationships.
- `filesystem` for targeted file reads and directory scans.
- `context7` only when framework behavior needs confirmation.
- `memory` to preserve stable repo relationships for later tasks.

## Output Shape
- Entry points.
- Important symbols and files.
- Dependencies and side effects.
- Risk areas for edits or review.
