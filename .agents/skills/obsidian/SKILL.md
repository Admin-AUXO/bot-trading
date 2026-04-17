---
name: obsidian
description: Use to read/write durable context in the `notes/` Obsidian vault — sessions, decisions, investigations, runbooks, reference, trading-memory — so agents start from vault context instead of rediscovering.
allowed-tools: Read, Grep, Glob, Edit, Write
---

# $obsidian

Use when task should leave durable context.

## Read Path

1. `notes/README.md`
2. `notes/reference/index.md`
3. one task-specific ref doc
4. one task-specific durable note

## Note Placement

| Folder | Use |
|--------|-----|
| `reference/` | Canonical contracts |
| `sessions/` | Active workstream summaries |
| `investigations/` | Debugging and research |
| `decisions/` | Durable choices |
| `runbooks/` | Repeatable procedures |
| `trading-memory/` | Provider, market, strategy lessons |

## Rules

- Update existing note, not duplicates
- Start with one ref + one durable note
- Short sessions → archive when done
- Stable facts belong in reference/decisions/trading-memory
- Procedure repeats? Promote to skill
- Keep `source_files` current; link not copy

## Docker Vault

```bash
cd trading_bot && docker compose --profile notes up -d obsidian
```

URL: `https://127.0.0.1:3111`, vault: `/config/vaults/bot-trading`
