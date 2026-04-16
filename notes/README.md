# Notes Vault

Obsidian vault for durable context across sessions. Agents use this instead of rediscovering things.

## Quick Start

1. `notes/README.md` ← you are here
2. `notes/reference/index.md` ← pick one ref doc
3. one durable note from `sessions/`, `investigations/`, `decisions/`, `runbooks/`, or `trading-memory/`
4. code

## Folders

| Folder | Purpose |
|--------|---------|
| `reference/` | Canonical repo docs (contracts, API, stack, strategy) |
| `sessions/` | Active workstream summaries |
| `sessions/archive/` | Old handoffs |
| `investigations/` | Debugging and research |
| `decisions/` | Durable choices and why |
| `runbooks/` | Repeatable procedures |
| `trading-memory/` | Provider, market, and strategy lessons |
| `templates/` | Note templates |

## Rules

- **One owning note.** Update one note, not five.
- **Link, don't copy.** Keep `source_files` current.
- **Short sessions.** If done, archive the handoff.
- **Move facts up.** Stable lessons belong in `reference/`, `decisions/`, or `trading-memory/`, not in sessions.
- **Promote to skill.** If a procedure repeats, make it a skill.

## Templates

Use frontmatter:

```yaml
---
type:
status:
area:
date:
source_files: []
---
```

## Vault Access

```bash
cd trading_bot
docker compose --profile notes up -d obsidian
```

Open `https://127.0.0.1:3111` → vault: `/config/vaults/bot-trading`
