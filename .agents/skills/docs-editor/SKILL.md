---
name: "docs-editor"
description: "Workflow for researching, editing, and validating repository documentation, READMEs, runbooks, and developer notes so docs match actual code behavior."
---

# Docs Editor

Use this skill for documentation work.

## Goals
- Keep docs aligned with actual code and commands.
- Remove stale guidance and vague wording.
- Prefer concise task-oriented docs over long narrative text.
- Link to canonical sources when possible.

## Preferred Tools
- `filesystem` for local docs and command references.
- `fetch` for product and external documentation.
- `context7` for framework-specific details.
- `serena` when docs depend on code ownership or symbol behavior.

## Editing Rules
- Do not invent commands or paths.
- Verify examples against the current repo layout.
- Keep operational instructions precise and short.
