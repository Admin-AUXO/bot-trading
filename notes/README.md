# Repo Notes

This folder is the Obsidian vault for repo docs and memory across sessions.

Use it for durable context that should survive beyond one Codex thread:

- canonical repo reference docs
- session handoffs
- investigations
- decisions
- runbooks
- trading memory
- visual maps

Do not use it for raw code copies, generated reports, or diary spam. The source of truth for code stays in `trading_bot/`, and the source of truth for code structure stays in `graphify-out/`.

## Read Order

For every new Codex session in this repo:

1. `notes/README.md`
2. `reference/index.md`
3. `reference/agent-workflow.md` only when the task is planning-heavy, ambiguous, or should leave reusable guidance behind
4. one task-relevant reference note
5. one task-relevant durable note
6. then `graphify-out/GRAPH_REPORT.md` only when architecture or ownership context matters
7. then source files

## Folder Map

- `reference/`: canonical repo docs inside the vault
  includes repo contracts like the dashboard UI note, API surface, stack shape, Docker flow, and Obsidian workflow
- `daily/`: daily working notes
- `sessions/`: short active workstream summaries plus archived handoffs
- `investigations/`: debugging or research notes
- `decisions/`: durable decisions and rationale
- `runbooks/`: repeatable operating procedures
- `trading-memory/`: durable market, provider, execution, and strategy memory
- `maps/`: `.canvas` files
- `templates/`: note templates

## Active Use Rules

- Treat `reference/` as the canonical doc set. The old `docs/` tree is gone on purpose.
- Keep general agent guidance easy to find in `reference/`, not buried in one-off session notes or niche runbooks.
- Keep `sessions/` lean. Active summaries stay in the root of `sessions/`; dead handoffs belong in `sessions/archive/`.
- Default read scope is one reference note plus one durable note. Widen only when that pair is insufficient.
- If the dashboard shell, typography, layout language, or Grafana split changes, update `reference/dashboard-operator-ui.md` in the same pass.
- Before touching code, read the relevant reference doc and the relevant durable note if one exists.
- After a substantive task, update one of `sessions/`, `investigations/`, `decisions/`, `runbooks/`, or `trading-memory/` if the task produced durable knowledge.
- Put strategy, provider, execution, and market observations in `trading-memory/` so later sessions can reuse them.
- Keep note links and `source_files` current when you change contracts or learn something worth reusing.
- If a runbook or repeated note is really an agent procedure, convert it into a skill and leave a short pointer behind.

## Best Practices

- Read active summaries before archive handoffs.
- Update one owning note instead of several overlapping notes.
- Prefer links and summaries over long pasted logs or code.
- Keep decision notes to the contract, not the argument transcript.
- Keep runbooks to repeatable procedure only.
- Keep provider and strategy lessons in trading memory, not in sessions.

## Good Vault Candidates

Document these in Obsidian when they become durable:

- repo contracts and workflows
- planning frameworks and questioning discipline
- dashboard inventories and datasource maps
- KPI definitions and cohort semantics
- provider quirks and execution gotchas
- incident lessons, alert rationale, and recovery procedures
- rollout rules, config-impact notes, and verification checklists

## Properties

Preferred frontmatter:

```yaml
type:
status:
area:
date:
source_files: []
graph_checked:
next_action:
```
