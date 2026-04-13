---
type: reference
status: active
area: graphify
date: 2026-04-11
source_files:
  - .agents/skills/graphify/SKILL.md
  - .codex/scripts/graphify.mjs
  - .codex/scripts/graphify-local-run.py
  - .codex/scripts/graphify-rebuild.mjs
  - .graphifyignore
graph_checked:
next_action:
---

# Graphify

Purpose: keep the repo graph local, reproducible, and code-only.

## Supported Path

- Skill: [`.agents/skills/graphify/SKILL.md`](../../.agents/skills/graphify/SKILL.md)
- Wrapper: [`.codex/scripts/graphify.mjs`](../../.codex/scripts/graphify.mjs)
- Local runner: [`.codex/scripts/graphify-local-run.py`](../../.codex/scripts/graphify-local-run.py)
- Rebuild helper: [`.codex/scripts/graphify-rebuild.mjs`](../../.codex/scripts/graphify-rebuild.mjs)
- Ignore rules: [`.graphifyignore`](../../.graphifyignore)

## Commands

```bash
node ./.codex/scripts/graphify.mjs build-local .
node ./.codex/scripts/graphify.mjs query "RiskEngine"
node ./.codex/scripts/graphify.mjs hook status
node ./.codex/scripts/graphify-rebuild.mjs
```

## Rules

- The supported repo workflow is code-only.
- Do not promise semantic note ingestion, image ingestion, or delegated doc analysis. The local runner excludes markdown and other non-code files on purpose.
- Read `graphify-out/GRAPH_REPORT.md` when architecture or ownership context matters, but verify any claim against source code before repeating it in docs or chat.
- Build with `build-local` when no graph exists yet.
- Rebuild only when `graphify-out/graph.json` already exists.
- The Node wrappers are the supported path on both macOS and Windows. The `.sh` files remain as POSIX compatibility shims.

## Outputs

- `graphify-out/graph.json`
- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/graph.html`
- `graphify-out/manifest.json`

## Notes

- The wrapper provisions a local `.graphify-venv/` and records the interpreter in `.graphify_python` plus `graphify-out/.graphify_python`.
- Graph artifacts and local graphify state are intentionally gitignored.
- `GRAPH_REPORT.md` now suppresses empty and tiny communities so the report stays architecture-shaped instead of turning into a singleton graveyard.
