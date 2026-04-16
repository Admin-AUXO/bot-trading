# Agent Workflow

## Questioning Rules

Ask only when the answer changes the solution shape.

**Good reasons:**
- Multiple valid paths with non-obvious tradeoffs
- Hidden product or operational decision needed
- Important ambiguity unresolved
- Answer determines data model, infra, or safety behavior

**Bad reasons:**
- Outsourcing basic thinking
- Info in the repo
- Obvious default preference
- Padding with vague discovery

## Multiple Choice

- 2-4 real options, recommend one
- Make tradeoff legible in one sentence
- Allow multi-select if user needs more than one

## Note Placement

| Folder | When |
|--------|------|
| `reference/` | Canonical contracts, recurring guidance |
| `sessions/` | Handoffs between sessions |
| `investigations/` | Non-trivial debugging or research |
| `decisions/` | Durable choices and rationale |
| `runbooks/` | Repeatable procedures |
| `trading-memory/` | Provider, market, execution, strategy |

## Standard Procedure

1. Read minimum note surface for the task
2. Planning-heavy? Use Plan mode
3. Structured prompt: goal, context, constraints, done-when
4. Non-trivial? Delegate startup brief to `session_briefer`
5. Ask only if it changes solution shape
6. Change smallest correct file set
7. Verify, check for regressions
8. Before final response: delegate note cleanup to `notes_curator`
9. Update owning note in same pass
10. Repeated procedure? Promote to skill

## Vault Rules

- Update existing note before creating duplicate
- Keep `source_files` current
- Link notes, don't repeat explanations everywhere
- Note describes reusable agent procedure? Make it a skill

## Token Rules

- Read one reference + one durable note first
- Don't read archive unless active notes leave a gap
- Concise summaries over pasted logs or code
- Use compact MCP profile unless task needs postgres, browser, or external research
- Compact session before thread bloat
