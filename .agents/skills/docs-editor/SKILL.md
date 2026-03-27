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
- Capture operational invariants that recent incidents or audits made explicit, such as auth boundaries, deterministic analytics, and no-migration repo rules.

## Preferred Tools
- `filesystem` for local docs and command references.
- `fetch` for product and external documentation.
- `context7` for framework-specific details.
- `serena` when docs depend on code ownership or symbol behavior.

## Editing Rules
- Do not invent commands or paths.
- Verify examples against the current repo layout.
- Keep operational instructions precise and short.
- When docs mention verification or control paths, make sure they reflect the real build, lint, auth, and proxy behavior in the codebase.
