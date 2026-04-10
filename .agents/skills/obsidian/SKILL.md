---
name: obsidian
description: use for repo-local Obsidian docs, session memory, trading memory, decisions, investigations, runbooks, and vault-first documentation updates
trigger: $obsidian
---

# $obsidian

Use this skill when the task mentions Obsidian, vault notes, repo docs migration, session memory, durable memory, decision logs, runbooks, or trading memory.

This repo treats Obsidian as the canonical documentation and memory layer. `notes/reference/` holds the canonical docs. `notes/` also holds the memory that later Codex sessions should reuse. Graphify stays code-only.

## Read Order

Before reading code, open these in order:

1. `notes/README.md`
2. `notes/reference/index.md`
3. the task-relevant reference note under `notes/reference/`
4. the task-relevant durable note under `notes/sessions/`, `notes/investigations/`, `notes/decisions/`, `notes/runbooks/`, or `notes/trading-memory/`
5. `graphify-out/GRAPH_REPORT.md` if the task needs architecture context

## Canonical Paths

- Repo references: `notes/reference/`
- Session handoffs: `notes/sessions/`
- Investigations: `notes/investigations/`
- Decisions: `notes/decisions/`
- Runbooks: `notes/runbooks/`
- Trading memory: `notes/trading-memory/`
- Templates: `notes/templates/`

## What To Update

- If a repo contract changes, update the matching note in `notes/reference/`.
- If a task leaves handoff context, update or create a note in `notes/sessions/`.
- If you debugged or researched something non-trivial, update or create a note in `notes/investigations/`.
- If you made a durable choice, update or create a note in `notes/decisions/`.
- If you documented a repeatable procedure, update or create a note in `notes/runbooks/`.
- If you learned something about strategy behavior, provider quirks, execution risk, or market regime that would save time later, update or create a note in `notes/trading-memory/`.

## Working Rules

- Do not store raw code copies in notes. Link source files instead.
- Keep `source_files` frontmatter current on notes that depend on code.
- Prefer editing an existing note over creating duplicates.
- If you create a new durable note, link it from the nearest index note.
- Keep Graphify code-only. Do not try to force markdown notes back into the graph.

## Templates

Use these as the starting point:

- `notes/templates/session-note.md`
- `notes/templates/investigation.md`
- `notes/templates/decision.md`
- `notes/templates/runbook.md`
- `notes/templates/trading-memory.md`

## Docker Sidecar

If the user wants the Obsidian UI, use the repo sidecar:

```bash
cd trading_bot
docker compose --profile notes up -d obsidian
```

Open `https://127.0.0.1:3111` and use the existing vault at `/config/vaults/bot-trading`.
