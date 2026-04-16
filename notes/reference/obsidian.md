# Obsidian

Vault for durable context. Agents read from here instead of rediscovering.

## Read Path

1. `../README.md`
2. `index.md`
3. one task-specific ref doc
4. one task-specific durable note

## Folders

| Folder | Use |
|--------|-----|
| `reference/` | Canonical repo contracts |
| `sessions/` | Active workstream summaries |
| `investigations/` | Debugging and research |
| `decisions/` | Durable choices |
| `runbooks/` | Repeatable procedures |
| `trading-memory/` | Provider, market, strategy lessons |

## Rules

- One owning note, not duplicates
- Short sessions → archive when done
- Stable facts belong in `reference/`, `decisions/`, or `trading-memory/`
- Keep `source_files` current; link instead of copy
- Promote repeated procedures to skills

## Docker Sidecar

```bash
cd trading_bot
docker compose --profile notes up -d obsidian
```

- URL: `https://127.0.0.1:3111`
- Vault: `/config/vaults/bot-trading`
