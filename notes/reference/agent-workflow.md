---
type: reference
status: active
area: workflow
date: 2026-04-11
source_files:
  - AGENTS.md
  - trading_bot/AGENTS.md
  - notes/README.md
  - notes/reference/obsidian.md
graph_checked: 2026-04-10
next_action: Read this early in planning-heavy sessions so question quality, assumptions, and vault updates are handled intentionally instead of ad hoc.
---

# Agent Workflow

Purpose: give agents one easy-to-find place for questioning discipline, documentation rules, and vault hygiene.

Use this when the task is ambiguous, planning-heavy, or likely to leave durable knowledge behind.

## Questioning Rules

Ask questions only when they change the shape of the solution.

Good reasons to ask:

- the user has multiple valid paths with non-obvious tradeoffs
- a hidden product or operational decision must be made
- the repo and request leave an important ambiguity unresolved
- the answer determines data model, infra, or safety-critical behavior

Bad reasons to ask:

- to outsource basic thinking
- to ask for information that can be found in the repo
- to ask for preference on something with an obvious default
- to pad the interaction with vague discovery questions

## Multiple-Choice Rules

When questions are needed:

- give 2 to 4 real options
- recommend one option
- do not include deliberately bad options just to make the recommendation look smart
- make the tradeoff legible in one sentence
- allow multi-select if the user clearly needs more than one answer

- scope or dashboard family first
- audience or job second
- comparison mode, filters, and evidence after that

## Documentation Rules

If the task teaches the repo something durable, write it down in `notes/`.

Put the knowledge in the narrowest correct place:

- `notes/reference/` for canonical repo contracts and recurring agent guidance
- `notes/sessions/` for handoffs between sessions
- `notes/investigations/` for non-trivial debugging or research
- `notes/decisions/` for durable choices and rationale
- `notes/runbooks/` for repeatable procedures
- `notes/trading-memory/` for provider, market, execution, and strategy lessons

## Standard Procedure

1. Read the minimum note surface that can answer the task.
2. Ask questions only if they change the shape of the solution.
3. Change the smallest correct file set.
4. Verify the changed surface.
5. Update the owning note in the same pass.
6. Promote repeated procedures into skills instead of preserving prompt-heavy notes.

## Vault Rules

- update an existing canonical note before creating a duplicate
- keep `source_files` current
- link notes instead of repeating the same explanation everywhere
- if a repo contract changes, update the matching reference note in the same pass
- keep notes decision-oriented, not diary-shaped, unless they belong in archive or daily logs

## Token Best Practices

- read one reference note and one durable note before widening scope
- do not read archive handoffs unless active notes leave a gap
- prefer concise summaries over long copied logs, code, or command output
- convert repeated procedures into skills so future runs stop paying note tax
- follow [`tool-routing.md`](tool-routing.md) so overlapping MCPs do not turn simple tasks into expensive ones

## Failure Modes

- asking broad open-ended questions when a choice architecture would do
- letting the user define implementation details before the problem is scoped
- burying reusable guidance in a one-off runbook
- creating note duplicates because the nearest existing note was not checked first
- documenting a plan in chat only and leaving the vault empty

## Linked Notes

- [Repo Notes](../README.md)
- [Reference Index](index.md)
- [Obsidian](obsidian.md)
