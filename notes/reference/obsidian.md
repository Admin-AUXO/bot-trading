---
type: reference
status: active
area: obsidian
date: 2026-04-11
source_files:
  - trading_bot/docker-compose.yml
  - .agents/skills/obsidian/SKILL.md
  - .codex/hooks.json
  - AGENTS.md
  - trading_bot/AGENTS.md
  - notes/reference/agent-workflow.md
graph_checked:
next_action:
---

# Obsidian

Purpose: keep repo docs and durable memory in one searchable vault so later agents do not have to rediscover the same facts.

## Read Path

1. [`../README.md`](../README.md)
2. [`index.md`](index.md)
3. [`agent-workflow.md`](agent-workflow.md) only when the task is planning-heavy, ambiguous, or should leave reusable guidance behind
4. one task-specific reference note
5. one task-specific durable note
6. [`../../graphify-out/GRAPH_REPORT.md`](../../graphify-out/GRAPH_REPORT.md) only when architecture or ownership context matters

## Note Ownership

- `notes/reference/`: canonical repo contracts
- `notes/sessions/`: short active workstream summaries
- `notes/sessions/archive/`: dead handoffs and completed session history
- `notes/investigations/`: evidence and diagnosis
- `notes/decisions/`: durable choices and rationale
- `notes/runbooks/`: repeatable procedures
- `notes/trading-memory/`: stable provider, market, execution, and strategy lessons

## Rules

- Prefer updating an existing note over creating a duplicate.
- Read the minimum useful note set first: one reference, one durable note, then widen only if needed.
- Keep session notes short. If the work is done, archive the handoff instead of leaving it in the active read path.
- Move stable facts out of `sessions/` and into `reference/`, `investigations/`, `decisions/`, `runbooks/`, or `trading-memory/`.
- Keep `source_files` current and link code instead of copying it.
- Keep Graphify code-only. Notes belong in the vault, not the graph.
- If a note describes a repeatable agent workflow, convert that procedure into a skill and leave the note as a pointer plus durable constraints.

## Standard Procedure

1. Read `notes/README.md`.
2. Read `notes/reference/index.md`.
3. Read one task-specific reference note.
4. Read one task-specific durable note.
5. Touch code.
6. After verification, update the owning note.
7. If the workflow should recur, create or update a skill.

## Token Best Practices

- Avoid whole-folder reads unless you are curating notes.
- Prefer `sessions/` active summaries over archive handoffs.
- Prefer concise note updates over preserving full session transcripts.
- Keep procedure in skills, memory in notes, and structure in Graphify.
- Keep repo facts in Obsidian, not `memory`; use [`tool-routing.md`](tool-routing.md) when tool overlap could waste context.

## Docker Sidecar

Compose service: [`../../trading_bot/docker-compose.yml`](../../trading_bot/docker-compose.yml)

```bash
cd trading_bot
docker compose --profile notes up -d obsidian
```

- HTTPS: `https://127.0.0.1:3111`
- HTTP: `http://127.0.0.1:3110`
- Container config persists in `obsidian-config`
- The repo vault is bind-mounted from `../notes`

Inside Obsidian, open `/config/vaults/bot-trading` as the existing vault. Do not create a nested vault.

## Safety

- Keep the service bound to localhost unless you add a real reverse proxy and real auth.
- LinuxServer’s Obsidian container includes terminal access in the GUI; treat it as trusted-local-only tooling.
