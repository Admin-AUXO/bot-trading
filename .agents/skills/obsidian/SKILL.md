---
name: obsidian
description: use for repo-local docs and durable memory so later Codex sessions can start from the vault instead of rediscovering context
trigger: $obsidian
---

# $obsidian

Use this skill whenever the task should leave durable context behind.

## Read Path

1. `notes/README.md`
2. `notes/reference/index.md`
3. one task-specific reference note
4. one task-specific durable note
5. `graphify-out/GRAPH_REPORT.md` only if architecture context matters

Do not read whole note folders unless the task is note curation itself.

## Note Ownership

- `notes/reference/`: canonical repo contracts
- `notes/sessions/`: short handoffs and active workstream summaries
- `notes/investigations/`: evidence and diagnosis
- `notes/decisions/`: durable choices and rationale
- `notes/runbooks/`: repeatable procedures
- `notes/trading-memory/`: stable provider, market, execution, and strategy lessons

## Rules

- Prefer updating an existing note over creating a duplicate.
- Start with one reference note and one durable note. Widen only if they do not answer the task.
- Session notes should be short: what changed, what was verified, what still smells wrong, and what durable notes absorbed the lesson.
- Move stable facts out of sessions and into `reference/`, `investigations/`, `decisions/`, `runbooks/`, or `trading-memory/`.
- Archive dead handoffs instead of letting `notes/sessions/` become a landfill.
- Keep `source_files` current and link code instead of copying it.
- Keep Graphify code-only; do not push markdown notes into the graph.
- Update the nearest index note when you add or archive a durable note.
- If the note describes a reusable agent procedure, create or update a skill and trim the note to a pointer plus durable rules.

## Best Practices

- Keep procedure in skills, memory in notes, and structure in Graphify.
- Prefer active workstream summaries over archive handoffs.
- Prefer one owning note update over several overlapping note edits.
- Prefer short decision notes, short runbooks, and short session summaries.

## Obsidian UI

If the user wants the local vault in a browser:

```bash
cd trading_bot
docker compose --profile notes up -d obsidian
```

Open `https://127.0.0.1:3111` and use `/config/vaults/bot-trading`.
