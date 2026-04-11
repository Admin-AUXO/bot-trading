---
type: reference
status: active
area: workflow
date: 2026-04-10
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

Use this when the task is ambiguous, planning-heavy, documentation-heavy, or likely to leave durable knowledge behind.

## Read This Early When

- the user asks for a plan
- the task spans multiple systems
- the task is heavy on dashboards, analytics, infra, or architecture
- the user says "research", "optimize", "improve", or "what should we build"
- the work will likely create reusable knowledge for later sessions

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

## How To Ask Better Questions

Start one layer above the symptom.

Bad:

- "What charts do you want?"
- "How should this look?"
- "Any other details?"

Better:

- "What decision must this dashboard support?"
- "What comparison matters most here: prior period, prior config, or peer cohort?"
- "Which dimensions deserve first-class filters because they change the conclusion?"

## Multiple-Choice Rules

When questions are needed:

- give 2 to 4 real options
- recommend one option
- do not include deliberately bad options just to make the recommendation look smart
- make the tradeoff legible in one sentence
- allow multi-select if the user clearly needs more than one answer

Question sets should move from broad to specific:

1. scope or dashboard family
2. audience or job
3. comparison mode
4. filters and cohorts
5. evidence tables
6. delivery artifact

## Planning Best Practices

- define the audience first
- define the main question second
- separate monitoring, analytics, and RCA unless there is a strong reason to blend them
- prefer upstream data modeling over clever dashboard transformations
- call out what the current data model cannot support yet
- treat sparse history as a design condition, not an excuse to skip structure
- use default time ranges and filters that match the dashboard job

## Documentation Rules

If the task teaches the repo something durable, write it down in `notes/`.

Put the knowledge in the narrowest correct place:

- `notes/reference/` for canonical repo contracts and recurring agent guidance
- `notes/sessions/` for handoffs between sessions
- `notes/investigations/` for non-trivial debugging or research
- `notes/decisions/` for durable choices and rationale
- `notes/runbooks/` for repeatable procedures
- `notes/trading-memory/` for provider, market, execution, and strategy lessons

## What Belongs In Obsidian

Good candidates for the vault:

- canonical system contracts
- dashboard inventories and datasource maps
- dataset definitions and KPI semantics
- config history rules and rollout policies
- provider quirks, quotas, and endpoint gotchas
- execution and wallet safety lessons
- incident timelines and RCA summaries
- verification recipes and recovery procedures
- open questions worth revisiting later
- architecture maps and ownership boundaries
- decision logs for changes that should not be re-argued every session

Do not put these in the vault as source of truth:

- raw code copies
- generated reports that can be rebuilt
- transient command output with no durable lesson
- dashboard JSON dumps without context
- data extracts better stored in the database or a proper artifact store

## Best Practices For Vault Notes

- prefer updating an existing canonical note over creating a duplicate
- keep `source_files` current
- link related notes instead of repeating the same explanation in five places
- if a note changes a repo contract, update the matching reference note in the same pass
- write enough context that the next agent can continue without re-diagnosing the problem
- keep notes decision-oriented, not diary-shaped, unless they live in `daily/`

## What Else Should Be Documented Here

Areas that are worth documenting better in this repo:

- Grafana provisioning layout and dashboard ownership once implemented
- datasource contracts and which dashboards depend on which SQL views
- config versioning model once it exists
- live-trade monitoring semantics:
  stale position, intervention priority, execution anomaly
- telemetry error taxonomy once raw payload RCA is formalized
- cohort definitions:
  daypart, liquidity band, volume band, security risk, exit profile
- alerting rules and why each alert exists
- wallet and live-trading operational runbooks
- dashboard validation checklist after provisioning

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
- [Runbook - Preparing Grafana Dashboard Planning Questions](../runbooks/2026-04-10-preparing-grafana-dashboard-planning-questions.md)
