# Bot Trading Project

Solana meme coin scalping bot with discovery lab, dashboard, and real-time execution.

## Architecture

```
trading_bot/
├── backend/           # Node.js + Prisma + Express API
│   ├── src/engine/   # Runtime: execution, graduation, exit engines
│   ├── src/services/ # Birdeye, Helius, operator desk, strategy
│   └── prisma/       # Schema + SQL views
├── dashboard/        # Next.js 14 (App Router)
├── grafana/          # Grafana dashboard configs
├── firecrawl/        # Firecrawl MCP integration
└── scripts/          # Dev helper scripts

notes/                # Obsidian vault
├── sessions/         # Session handoffs
├── decisions/        # Architecture decisions
├── investigations/   # Research findings
├── runbooks/         # Procedures
├── reference/        # Canonical documentation
└── trading-memory/   # Provider and strategy notes
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Blockchain | Solana (Jupiter, Birdeye, Helius) |
| Backend | Node.js, TypeScript, Prisma, Express |
| Frontend | Next.js 14, Tailwind CSS, AG Grid |
| Database | PostgreSQL 16 |
| Monitoring | Grafana + Prometheus |

## Local Development

```bash
# Start everything
cd trading_bot && docker compose up -d

# Backend (separate terminal)
cd trading_bot/backend && npm run dev

# Dashboard (separate terminal)
cd trading_bot/dashboard && npm run dev

# Database tools
npx prisma migrate dev
npx prisma studio
```

## Key Rules

1. **Schema changes** → `backend/prisma/schema.prisma`, run `npm run db:generate`
2. **View changes** → `backend/prisma/views/create_views.sql`
3. **Provider logic** → `backend/src/services/` only
4. **Dashboard writes** → `dashboard/app/api/[...path]/route.ts`
5. **Safety-critical** → entries, exits, capital checks

## MCP Servers

| Server | Purpose |
|--------|---------|
| `desktop_commander` | File operations |
| `birdeye-mcp` | Token data, prices |
| `helius` | RPC, smart money |
| `firecrawl` | Web scraping |

## Obsidian Vault

Use `notes/` for all project memory:
- Session handoffs in `sessions/`
- Decisions in `decisions/`
- Reference docs in `reference/`
