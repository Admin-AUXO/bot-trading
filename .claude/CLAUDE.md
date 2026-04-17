# Bot Trading Project — Claude Code Guide

Solana meme coin scalping bot with discovery lab, dashboard, and real-time execution.

## Quick Start

```bash
cd trading_bot
npm run dev          # Backend + TypeScript
docker compose up    # Postgres
cd dashboard && npm run dev  # Dashboard
```

## Project Structure

```
trading_bot/
├── backend/src/engine/     # Execution, graduation, exit engines
├── backend/src/services/   # Birdeye, Helius, operator desk
├── backend/prisma/        # Schema and SQL views
├── dashboard/components/    # AG Grid, dashboard UI
├── grafana/              # Grafana configs
└── scripts/              # Dev helpers

notes/                   # Obsidian vault
agents/skills/           # Reusable agent procedures
```

## Key Files

| Area | Path |
|------|------|
| Runtime engines | `trading_bot/backend/src/engine/` |
| Provider services | `trading_bot/backend/src/services/` |
| Dashboard UI | `trading_bot/dashboard/components/` |
| Schema | `trading_bot/backend/prisma/schema.prisma` |
| Strategy config | `notes/reference/strategy.md` |

## Tech Stack

- **Solana**: Jupiter, Birdeye API, Helius RPC/MCP
- **Backend**: Node.js, TypeScript, Prisma, Express
- **Frontend**: Next.js 14, Tailwind CSS, AG Grid
- **Monitoring**: Grafana + Prometheus

## MCP Servers

| Server | Purpose |
|--------|---------|
| `desktop_commander` | File operations, process management |
| `birdeye-mcp` | Token data, prices, market info |
| `helius` | RPC, smart money, webhooks |
| `firecrawl` | Web scraping |

## Agent Skills

Located in `.agents/skills/`:

| Skill | Purpose |
|-------|---------|
| `compose-stack-refresh` | Docker compose and stack refresh |
| `dashboard-operations` | Dashboard runtime ops |
| `dashboard-ui-ux` | Dashboard UI changes |
| `database-safety` | Prisma/schema safety rules |
| `docker-ops` | Docker operations |
| `docs-editor` | Documentation editing |
| `graphify` | Architecture graph workflow |
| `obsidian` | Note-taking workflow |
| `session-bookends` | Session start/end procedures |
| `strategy-safety` | Trading safety rules |
| `trading-research-workflow` | Trading research |
| `screenshot-analysis` | UI screenshot review |
| `performance-investigation` | Performance debugging |

## Permissions

`settings.local.json` contains local overrides (gitignored). Shared settings in `settings.json`.

## Development Rules

- Prefer smallest correct change
- Entries, exits, capital checks are safety-critical
- No Prisma migration files — use schema.prisma directly
- Provider calls stay inside `backend/src/services/`
- Dashboard writes go through `dashboard/app/api/[...path]/route.ts`
