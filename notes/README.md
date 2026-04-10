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

Do not use it for raw code copies or generated reports. The source of truth for code stays in `trading_bot/`, and the source of truth for code structure stays in `graphify-out/`.

## Read Order

For every new Codex session in this repo:

1. `notes/README.md`
2. `reference/index.md`
3. the relevant note under `reference/`, `sessions/`, `investigations/`, `decisions/`, `runbooks/`, or `trading-memory/`
4. then `graphify-out/GRAPH_REPORT.md`
5. then source files

## Folder Map

- `reference/`: canonical repo docs inside the vault
- `daily/`: daily working notes
- `sessions/`: handoffs between Codex sessions
- `investigations/`: debugging or research notes
- `decisions/`: durable decisions and rationale
- `runbooks/`: repeatable operating procedures
- `trading-memory/`: durable market, provider, execution, and strategy memory
- `maps/`: `.canvas` files
- `templates/`: note templates

## Active Use Rules

- Treat `reference/` as the canonical doc set. The old `docs/` tree is gone on purpose.
- Before touching code, read the relevant reference doc and the relevant durable note if one exists.
- After a substantive task, update one of `sessions/`, `investigations/`, `decisions/`, `runbooks/`, or `trading-memory/` if the task produced durable knowledge.
- Put strategy, provider, execution, and market observations in `trading-memory/` so later sessions can reuse them.
- Keep note links and `source_files` current when you change contracts or learn something worth reusing.

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
