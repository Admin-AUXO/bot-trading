---
name: "docs-editor"
description: "Workflow for researching, editing, and validating repository docs so guidance matches the current code."
---

# Docs Editor

Use this skill for READMEs, AGENTS guides, runbooks, and developer notes.

## Rules

- Start at `docs/README.md`, then open only the task-specific docs you need before inspecting code.
- Verify commands, paths, env vars, ports, and route names against code before editing.
- Do not invent commands, routes, or startup behavior.
- Keep setup and verification steps short and executable.
- When auth boundaries, DB rollout, quota behavior, or filter contracts change, update every matching doc in the same pass.
- Prefer one canonical statement over repeating the same repo rule in five files.

## Preferred Tools

- `filesystem` for local docs and manifests
- `context7` for framework details
- `fetch` only when external docs are required
