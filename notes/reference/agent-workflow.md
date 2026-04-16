---
type: reference
status: active
area: workflow
date: 2026-04-15
source_files:
  - AGENTS.md
  - trading_bot/AGENTS.md
  - notes/README.md
  - notes/reference/obsidian.md
  - .codex/hooks.json
  - .codex/scripts/session-start-hook.cjs
  - .codex/agents/session_briefer.toml
  - .codex/agents/implementation_worker.toml
  - .codex/agents/notes_curator.toml
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
2. For ambiguous, planning-heavy, or high-risk work, prefer Plan mode when it is available; otherwise start in ask mode.
3. Use a structured prompt shape: goal, context, constraints, done-when.
4. On non-trivial sessions, delegate a startup brief to a `gpt-5.4-mini` repo agent such as `session_briefer` after the required note reads and before broad code reads.
5. Ask questions only if they change the shape of the solution.
6. Change the smallest correct file set.
7. Verify the changed surface and review the resulting diff for regressions or missing tests.
8. Before the final response on substantive tasks, delegate note cleanup and handoff prep to a `gpt-5.4-mini` repo agent such as `notes_curator`, then review the note diff.
9. Update the owning note in the same pass.
10. Promote repeated procedures into skills instead of preserving prompt-heavy notes.

## Mini-Agent Bookends

Use a small repo-owned agent to compress the noisy parts of a session:

- startup brief: read the repo bootstrap path plus one relevant active or durable note, then return a compact summary for the main agent
- closeout pass: update the smallest correct Obsidian surface, trim or prepare the handoff note, and keep indexes honest
- bounded sidecar work: prefer `gpt-5.4-mini` for read-heavy exploration, repo-contract checks, note work, and other basic tasks that do not need expensive judgment
- bounded write work: prefer `gpt-5.3-codex` when the file surface is already understood and the task is mainly implementation execution rather than judgment

Keep the delegation shallow:

- do not hand the critical path to a subagent if the main agent is blocked on that answer right now
- do not spawn multiple agents that read or edit the same note set unless the write ownership is explicit
- reserve `gpt-5.4` for review, safety, and judgment-heavy work where wrong answers are expensive

Current repo evidence only supports a `SessionStart` hook reminder. Treat shutdown delegation as a pre-final checklist item, not a guaranteed hook.

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
- prefer the compact MCP startup profile unless the task clearly needs `postgres`, browser tools, or external research
- use background terminals and task queues for long-running or noisy work
- compact the session before the thread becomes bloated instead of waiting for a hard reset
- use lightweight git checkpoints like `git status` and `git diff --stat` to re-anchor repo state during long sessions

## Failure Modes

- asking broad open-ended questions when a choice architecture would do
- letting the user define implementation details before the problem is scoped
- skipping Plan mode or a clear prompt contract on tasks that are obviously multi-step
- burying reusable guidance in a one-off runbook
- creating note duplicates because the nearest existing note was not checked first
- documenting a plan in chat only and leaving the vault empty

## Linked Notes

- [Repo Notes](../README.md)
- [Reference Index](index.md)
- [Obsidian](obsidian.md)
