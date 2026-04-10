---
name: "docs-editor"
description: "Use for README, AGENTS, SKILL, and other agent-facing docs when they need to be audited, deduplicated, or rewritten to match current code and repo contracts."
---

# Docs Editor

Use this skill for repo-facing documentation, especially agent-only docs.

## Workflow

- Start at `docs/README.md` when the task touches repo docs.
- For skill docs, read the relevant `SKILL.md` files and tighten trigger language before adding body detail.
- Open only the task-specific docs you need before inspecting code.
- Verify commands, paths, env vars, ports, route names, and runtime claims against code before editing.
- Do not invent commands, routes, startup behavior, or repo capabilities.
- Keep setup and verification steps short and executable.
- When contracts change, update every matching doc in the same pass.
- If agent-facing skill docs describe runtime capabilities or constraints, update those too; stale `SKILL.md` files are still stale contracts.
- When a doc tree is stale and duplicated, delete it instead of rewording it.
- Prefer one canonical statement over repeating the same repo rule in five files.
