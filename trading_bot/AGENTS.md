# trading_bot Codex Guide

This guide applies inside `trading_bot/`.

## Reality

- This directory is the active app.
- Backend: TypeScript, Express 5, Prisma 7, PostgreSQL 16
- Dashboard: Next.js 16 App Router
- Strategy scope: S2 graduation only
- Providers: Birdeye and Helius
- `LIVE` remains blocked until a real swap-routing adapter exists

## Rules

- Read `../docs/README.md` and the relevant task doc first.
- Treat entry, exit, and capital rules as safety-critical.
- Do not create Prisma migration files.
- Keep schema edits in `backend/prisma/schema.prisma`.
- Keep SQL view edits in `backend/prisma/views/create_views.sql`.
- Keep provider integrations in `backend/src/services/`.
- Keep browser-facing writes on `dashboard/app/api/[...path]/route.ts`.
- Update docs in the same pass when setup, routes, or runtime behavior changes.
