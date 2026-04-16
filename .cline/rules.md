# Cline Rules for bot-trading

## Session Startup Order

1. Read `AGENTS.md` first
2. Read `notes/README.md`
3. Read `notes/reference/index.md`
4. Read task-relevant reference docs and memory notes
5. Only then open actual codebase files

## Key Conventions

### Work Areas
- Backend runtime: `trading_bot/backend/src/engine/`
- Provider clients: `trading_bot/backend/src/services/`
- Dashboard: `trading_bot/dashboard/`
- Schema: `trading_bot/backend/prisma/schema.prisma`

### Safety-Critical Rules
- Entry, exit, and capital rules are safety-critical
- Verify strategy claims against `notes/reference/strategy.md` and engine code
- Do not create Prisma migrations; edit schema directly
- Keep provider calls inside `trading_bot/backend/src/services/`

### MCP Tooling
- Use `desktop_commander` for repo file operations (mirrored from Codex)
- Prefer MCP tools over direct shell for file operations
- Browser automation via `chrome_devtools` when needed

### Model Selection
- Default: MiniMax-M2.7-highspeed for both plan and act mode
- Compact tasks: MiniMax-M2.7-highspeed
- Implementation: MiniMax-M2.7-highspeed
- Reviews: MiniMax-M2.7-highspeed

### Approval Policy
- Safe commands and file reads: auto-approved
- File edits and external writes: require approval
- MCP tools: enabled
