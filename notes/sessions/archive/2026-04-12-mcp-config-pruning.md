---
type: session
status: active
area: codex
date: 2026-04-12
source_files:
  - .codex/config.toml
  - notes/reference/tool-routing.md
  - notes/investigations/2026-04-11-mcp-surface-audit.md
  - notes/sessions/index.md
graph_checked:
next_action: Keep repo MCPs narrow. If a tool is redundant with `desktop_commander` or fights the Obsidian routing model, cut it instead of documenting around it.
---

# Session - MCP Config Pruning

## What Changed

- Removed `filesystem` from `.codex/config.toml` because `desktop_commander` already owns local file reads, edits, search, and process-backed analysis.
- Removed `context7` from `.codex/config.toml` so version-sensitive external docs route through explicit web fetches instead of another overlapping MCP.
- Removed the disabled `memory` MCP stanza because Obsidian under `notes/` is the repo memory surface.

## Why

- Redundant MCPs create routing noise and token waste.
- `filesystem` duplicates a weaker slice of what `desktop_commander` already does.
- `memory` conflicts with the repo’s vault-first discipline.
- `context7` is useful in general, but not necessary here once the repo chooses local notes first and explicit primary-source fetches second.

## Durable Notes Updated

- `notes/reference/tool-routing.md`
- `notes/investigations/2026-04-11-mcp-surface-audit.md`
