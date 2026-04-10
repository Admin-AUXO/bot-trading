---
type: session
status: active
area: repo
date: 2026-04-10
source_files:
  - AGENTS.md
  - trading_bot/AGENTS.md
  - README.md
  - .codex/hooks.json
graph_checked:
next_action: Keep future repo docs and durable memory inside notes/.
---

# Session - Obsidian Cutover

## Context

The repo had Obsidian available as a sidecar, but the canonical docs still lived in `docs/`, so the vault was optional instead of authoritative.

## What Changed

- Promoted `notes/` to the canonical doc and memory surface.
- Added `notes/reference/` for repo contracts.
- Added an Obsidian skill for note discipline and memory updates.
- Repointed repo startup order and hooks away from the old `docs/` tree.

## What I Verified

- The repo has a dedicated vault structure for references, sessions, investigations, decisions, runbooks, and trading memory.
- The hook reminder now points to `notes/` first.

## Risks / Unknowns

- Any stale human habit that still assumes `docs/` is canonical will be wrong.
- Future work still needs to keep notes updated; structure alone does not fix laziness.

## Next Action

Use the new vault layout on the next substantive task and keep durable notes current.

## Durable Notes Updated

- [`../reference/index.md`](../reference/index.md)
- [`../trading-memory/index.md`](../trading-memory/index.md)
