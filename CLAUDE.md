# bot-trading

Solana memecoin algorithmic trading bot. TypeScript/Node.js backend + Next.js 16 dashboard. ~$200 capital, max 5 open positions.

## Stack
- **Backend**: TypeScript ESM, Node.js 20, Express 5, Prisma 7 + PostgreSQL 16, Redis + BullMQ, decimal.js (precision arithmetic), lru-cache (route caching), helmet, compression, pino-http
- **Dashboard**: Next.js 16 App Router, Tailwind CSS 4, shadcn/ui, Zustand, TanStack Query, Recharts, nuqs (URL search param state)
- **Solana**: Helius SDK (RPC + webhooks + wallet scoring), Birdeye (market data), Jupiter v6 (DEX routing), Jito (MEV bundles)
- **Infra**: Docker, CapRover on Hetzner CX23 VPS

## Project Layout
```
trading_bot/
├── src/
│   ├── core/           # trade-executor, dry-run-executor, position-tracker, risk-manager,
│   │                   #   exit-monitor, regime-detector, stats-aggregator, config-profile
│   ├── strategies/     # copy-trade.ts, graduation.ts, momentum.ts (3 parallel)
│   ├── services/       # helius.ts, birdeye.ts, jupiter.ts, outcome-tracker.ts, market-tick-recorder.ts
│   ├── api/            # Express server + routes: analytics, control, overview, positions, profiles, trades
│   │   └── middleware/ # auth.ts, cache.ts (LRU route cache)
│   ├── workers/        # wallet-scorer.ts (4-worker pool), stats-aggregator.ts
│   ├── db/             # client.ts (shared Prisma singleton)
│   └── utils/          # circuit-breaker, rate-limiter, api-call-buffer, worker-pool, logger (pino), types
├── prisma/             # schema.prisma, migrations/, views/create_views.sql, seed.ts
└── dashboard/          # Next.js app (pages: Home, Positions, Trades, Analytics, Settings)
```

## Database Schema
**Fact tables**: Trade, Position, WalletScore, Signal, ApiCall, WalletActivity, GraduationEvent
**Metric tables**: DailyStats, ApiUsageDaily, RegimeSnapshot, BotState, MarketTick, TokenSnapshot
**Config tables**: ConfigProfile
**SQL views**: v_dashboard_overview, v_active_positions, v_strategy_performance, v_api_budget, v_recent_trades, v_daily_pnl, v_capital_curve, v_profile_comparison, v_strategy_comparison, v_regime_performance, v_tranche_distribution, v_signal_accuracy

## Key Patterns
- **Logger**: Always `src/utils/logger.ts` (pino JSON) — never `console.log/warn/error`
- **Config**: Zod-validated at startup via `src/config/`
- **External APIs**: Wrapped in circuit breakers (`src/utils/circuit-breaker.ts`)
- **Rate limit**: 30 RPM sliding window cap
- **Modes**: `DRY_RUN=true` for simulation, live otherwise
- **Imports**: ESM — use `.js` extensions in relative imports (e.g. `import ... from './logger.js'`)

## Common Commands
```bash
# from trading_bot/
npm run dev          # backend (tsx watch)
npm run build        # tsup bundle
npm run typecheck    # tsc --noEmit (run before committing)
npm run db:migrate   # prisma migrate dev
npm run db:studio    # Prisma Studio UI

# from trading_bot/dashboard/
npm run dev          # Next.js dev (port 3000)
npm run build        # production build
```

## Coding Rules

All rules are in `.claude/rules/` — each file is auto-loaded by Claude Code:

| File | Scope |
|------|-------|
| `typescript-patterns.md` | ESM imports, logging, types, async, error handling |
| `trading-security.md` | Secrets, input validation, trade execution safety, DB safety |
| `git-workflow.md` | Commit format, branch naming, schema change protocol |
| `prisma-patterns.md` | Schema conventions, migration safety, query patterns, Decimal serialization |
| `api-routes.md` | Router factory pattern, query params, response conventions, error handling |
| `dashboard-patterns.md` | TanStack Query, mutations, ky client, pagination, tab-gated fetching |
| `solana-api-patterns.md` | Helius/Birdeye/Jupiter usage, rate limits, CB configs, token validation |
| `strategy-patterns.md` | TradeSource logic, skipped signal capture, exit tranches, regime rules |
| `testing-patterns.md` | Test location, mock patterns, required edge cases per module |

---

## Specialist Agents

Main context handles orchestration and simple edits. Spawn an agent for deep specialist work — validate output before applying.

| Agent | Invoke when... |
|-------|----------------|
| `codebase-navigator` | Read-only lookup — find implementations, trace usages, extract type signatures |
| `strategy-engineer` | Strategy logic, risk params, position sizing, trade execution paths |
| `analytics-advisor` | Historical trade performance, regime stats, edge metrics, exit/entry improvements |
| `dashboard-ui-expert` | Any work in `dashboard/` — components, charts, hooks, Zustand, Recharts, shadcn/ui |
| `db-engineer` | Schema design, migration safety, slow query optimisation, index strategy, SQL views |
| `performance-engineer` | Bottlenecks, async hot paths, BullMQ tuning, worker sizing, execution latency |
| `reliability-engineer` | Circuit breaker config, rate limiter, webhook reconnection, retry strategies, DLQ |
| `security-auditor` | Pre-deploy review, new API integrations, changes to config/auth/trade-execution |
| `code-reviewer` | Pre-commit review — correctness, security, pattern compliance |
| `docker-ops` | Docker Compose, CapRover config, Hetzner VPS ops, env vars, deploy procedures |
| `trading-research` | Current API docs (Helius/Birdeye/Jupiter), Solana protocol changes, rate limits |
| `web-research-specialist` | Web research outside trading bot domain — comparisons, best practices, changelogs |

---

## MCP Servers

| Server | Tools | Use when |
|--------|-------|----------|
| **Outerbase** | `query`, `query_rw`, `list_tables/columns` | Ad-hoc SQL, live trade inspection, DB state without Prisma Studio |
| **Context7** | `resolve-library-id` → `get-library-docs` | Library docs needed (Prisma, Next.js, shadcn, TanStack, BullMQ) |
| **Sequential Thinking** | `sequentialthinking` | Complex architectural changes, non-obvious debugging, decisions needing backtracking |
| **Claude Preview** | `preview_start/screenshot/snapshot/click/fill` | Verifying dashboard UI changes before marking complete |
| **Claude in Chrome** | browser automation | E2E testing dashboard against live API; reading external docs pages |
| **Windows MCP** | `PowerShell`, `Process`, `FileSystem`, `Screenshot` | Running build/typecheck/migrations, inspecting host processes |
| **Memory Graph** | `create_entities/relations`, `search_nodes` | Multi-file tasks tracking entity relationships across sessions |

---

# Agent Operating Protocol

## Decision Flow

```
TASK RECEIVED
     │
     ▼
Is task trivial (1-2 steps, no architecture decisions)?
     │
    YES ──► Execute directly. Verify. Done.
     │
    NO
     ▼
Enter Plan Mode ──► Write plan in-context ──► Check in with user ──► Implement
     │
     ▼
During execution: Is a file outside the original plan being touched?
     │
    YES ──► STOP. Justify explicitly before proceeding.
     │
    NO ──► Continue
     │
     ▼
Verification gate (see below)
     │
    PASS ──► Mark complete. Summarize.
     │
    FAIL ──► STOP. Re-plan. Do not patch forward — revert to last checkpoint.
     │
     ▼
Was a correction received? ──► Save corrective rule to project memory.
```

## Planning

- Write the plan in-context with checkable items before touching any code
- Plans must define: inputs, outputs, constraints, and what "done" looks like
- If a requirement is unclear **and** reversing a wrong decision takes >30 min: ask. Otherwise, infer and document the assumption inline.
- Note the rollback point: what state to revert to if verification fails

## Subagent Strategy

One task per subagent. Spawn when the subtask has bounded I/O, no shared mutable state, and can run in parallel. Validate output before applying — treat it like an external API response.

## Scope Control

- Only modify files in the original plan
- Before editing any unplanned file: stop, state why, then proceed
- Fewest files touched, fewest lines changed, zero side-effect bugs introduced

## Verification Gate

Never mark a task complete without passing all of these:

| Check | How |
|---|---|
| It works | Run tests, check logs, demonstrate correct output |
| No regressions | Diff behavior between main and your changes |
| Code quality | No unused imports, no hardcoded values, no silent error swallowing, no leftover TODOs |
| Staff engineer bar | Would a senior engineer approve this without comment? |

If any check fails: revert to rollback checkpoint, re-plan, do not patch forward.

## Elegance vs. Over-Engineering

For any non-trivial change, ask: **"Is there a simpler way to achieve the same correctness?"**

- **Elegant** = simpler and equally correct → always prefer
- **Over-engineered** = more complex for theoretical future benefit → reject
- **Hacky** = works now but will break or confuse later → reject; implement the clean solution

Tie-breaker: go with the option that's easier to delete.

## Bug Fixing

1. Reproduce it. Point at the specific log line, error, or failing test.
2. Find the root cause — not the symptom.
3. Fix it. No temporary patches. No TODOs left behind.
4. Verify the fix passes the verification gate.
5. Does this fix reveal a class of similar bugs? Fix those too.

## Self-Improvement Loop

After any correction: classify the mistake (wrong assumption / missing edge case / misread requirement / scope creep / over-engineering / environment mismatch), then write a specific actionable rule to project memory.

## Core Principles

- **Simplicity first** — the simplest correct solution is always preferred
- **No root cause skipping** — fix what caused the problem, not the symptom
- **No silent failures** — errors must surface, never be swallowed
- **Minimal footprint** — touch only what the plan requires
- **Prove it works** — demonstration beats assertion

## No code comments policy

No unnecessary comments in any code file.
