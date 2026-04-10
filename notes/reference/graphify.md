---
type: reference
status: active
area: graphify
date: 2026-04-10
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

Purpose: keep the repo-level knowledge graph workflow local to this project instead of depending on a hidden home-directory install.

## What Was Added

- Repo skill: [`.agents/skills/graphify/SKILL.md`](../../.agents/skills/graphify/SKILL.md)
- Wrapper: [`.codex/scripts/graphify.sh`](../../.codex/scripts/graphify.sh)
- Local full-build runner: [`.codex/scripts/graphify-local-run.py`](../../.codex/scripts/graphify-local-run.py)
- Code-only rebuild helper: [`.codex/scripts/graphify-rebuild.sh`](../../.codex/scripts/graphify-rebuild.sh)
- Always-on reminder hook: [`.codex/hooks.json`](../../.codex/hooks.json)
- Repo-specific ignore rules: [`.graphifyignore`](../../.graphifyignore)

## Why The Wrapper Exists

Do not assume the host `python3` is compatible with graphify. The wrapper finds a Python 3.10+ interpreter, creates a local `.graphify-venv/`, installs `graphifyy`, and records the interpreter path in `.graphify_python` and `graphify-out/.graphify_python`.

That keeps graphify reproducible for this repo and avoids mutating `~/.agents/skills` or any other hidden global state.

## Commands

In Codex, use the repo skill when you want the upstream interactive workflow:

```text
$graphify .
$graphify trading_bot --update
$graphify query "exit logic"
```

Use the shell helpers when you want the deterministic repo-local build path or code-only maintenance:

```bash
./.codex/scripts/graphify.sh build-local .
./.codex/scripts/graphify.sh --help
./.codex/scripts/graphify.sh hook status
./.codex/scripts/graphify-rebuild.sh
```

## Outputs

- `graphify-out/graph.json`: persistent graph data
- `graphify-out/GRAPH_REPORT.md`: audit report with community structure and god nodes
- `graphify-out/graph.html`: interactive visualization when generated
- `graphify-out/.graphify_python`: interpreter path used for graphify modules

## Constraints

- The graph and local virtualenv are intentionally gitignored.
- This repo treats Graphify as code-only. Markdown and other document or image files are excluded by `.graphifyignore`, and `./.codex/scripts/graphify.sh build-local .` only builds from source code.
- The upstream `$graphify` skill still exists when you want its interactive flow, but it depends on agent delegation for the deep semantic pass.
- `./.codex/scripts/graphify-rebuild.sh` only refreshes an existing graph. It does not create one from scratch.
