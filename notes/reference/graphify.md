---
type: reference
status: active
area: graphify
date: 2026-04-11
source_files:
  - .agents/skills/graphify/SKILL.md
  - .codex/scripts/graphify.sh
  - .codex/scripts/graphify-local-run.py
  - .codex/scripts/graphify-rebuild.sh
  - .graphifyignore
graph_checked:
next_action:
---

# Graphify

Purpose: keep the repo graph local, reproducible, and code-only.

## Supported Path

- Skill: [`.agents/skills/graphify/SKILL.md`](../../.agents/skills/graphify/SKILL.md)
- Wrapper: [`.codex/scripts/graphify.sh`](../../.codex/scripts/graphify.sh)
- Local runner: [`.codex/scripts/graphify-local-run.py`](../../.codex/scripts/graphify-local-run.py)
- Rebuild helper: [`.codex/scripts/graphify-rebuild.sh`](../../.codex/scripts/graphify-rebuild.sh)
- Ignore rules: [`.graphifyignore`](../../.graphifyignore)

## Commands

```bash
./.codex/scripts/graphify.sh build-local .
./.codex/scripts/graphify.sh query "RiskEngine"
./.codex/scripts/graphify.sh hook status
./.codex/scripts/graphify-rebuild.sh
```

## Rules

- The supported repo workflow is code-only.
- Do not promise semantic note ingestion, image ingestion, or delegated doc analysis. The local runner excludes markdown and other non-code files on purpose.
- Read `graphify-out/GRAPH_REPORT.md` when architecture or ownership context matters, but verify any claim against source code before repeating it in docs or chat.
- Build with `build-local` when no graph exists yet.
- Rebuild only when `graphify-out/graph.json` already exists.
- On Windows PowerShell, invoke the repo wrapper through `bash`. If the checked-out script has CRLF line endings, normalize it to LF before running or use a temporary LF copy.

## Outputs

- `graphify-out/graph.json`
- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/graph.html`
- `graphify-out/manifest.json`

## Notes

- The wrapper provisions a local `.graphify-venv/` and records the interpreter in `.graphify_python` plus `graphify-out/.graphify_python`.
- Graph artifacts and local graphify state are intentionally gitignored.
- `GRAPH_REPORT.md` now suppresses empty and tiny communities so the report stays architecture-shaped instead of turning into a singleton graveyard.
