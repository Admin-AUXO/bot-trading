# Cursor project configuration

This folder is **project-local** Cursor configuration: rules the Agent uses and MCP servers for this repo. It is safe to commit so the team shares the same defaults.

## Official references

- [Project rules](https://cursor.com/docs/rules) — `.mdc` frontmatter, when rules attach, size limits (~500 lines), prefer pointers over pasting code
- [MCP](https://cursor.com/docs/mcp) — `stdio` vs URL servers, `${workspaceFolder}` / `${env:…}` interpolation, debugging via **Output → MCP Logs**
- [Agent best practices](https://cursor.com/blog/agent-best-practices) — skills, focused rules, avoid context bloat

## Layout

| Path | Role |
|------|------|
| [`rules/core-repo.mdc`](rules/core-repo.mdc) | **Always apply** — startup order, safety, boundaries, MCP/skills pointers |
| [`rules/trading-bot-backend.mdc`](rules/trading-bot-backend.mdc) | Backend `trading_bot/backend/**/*.ts` |
| [`rules/trading-bot-dashboard.mdc`](rules/trading-bot-dashboard.mdc) | Dashboard `trading_bot/dashboard/**` |
| [`rules/prisma-and-views.mdc`](rules/prisma-and-views.mdc) | `trading_bot/backend/prisma/**` |
| [`mcp.json`](mcp.json) | MCP server definitions for Cursor (uses `${workspaceFolder}` in args for portable paths) |

Long-form contracts and procedures live in [`notes/reference/`](../notes/reference/) and [`AGENTS.md`](../AGENTS.md). Rules should stay short and **point** there instead of duplicating them.

## MCP maintenance

1. **Keep server names in sync** with the repo root [`.mcp.json`](../.mcp.json) (same `mcpServers` keys). Cursor reads `.cursor/mcp.json`; other harnesses read `.mcp.json`.
2. After edits, run: `node scripts/claude-harness/validate-mcp.mjs`
3. Prefer **env vars** for secrets in `env` / `headers`; avoid committing API keys ([MCP security](https://cursor.com/docs/mcp)).
4. Many servers → large tool surface. Toggle rarely used servers in **Settings → Features → Model Context Protocol** when debugging or to reduce noise.

## Rules maintenance

- Prefer **new focused rules** over one huge file ([rules docs](https://cursor.com/docs/rules)).
- For **Apply Intelligently**, the `description` field is what the model uses to decide relevance — keep it specific (areas, technologies, filenames).
- Rules affect **Agent (chat)**; they do not apply to **Tab** or **Cmd/Ctrl+K** inline edit ([rules FAQ](https://cursor.com/docs/rules)).
- Manual invocation: `@core-repo` (or the rule file name) in chat.

## Adding a server or rule

- **MCP:** add matching entries to `.mcp.json` and `.cursor/mcp.json`, then `validate-mcp.mjs`. Use `"type": "stdio"` for local commands; remote/streamable HTTP entries use `"url"` (and `"type": "http"` where the root config uses it).
- **Rule:** add `rules/<topic>.mdc` with YAML frontmatter; set `alwaysApply: true` only for repo-wide essentials.

## Hooks ([`hooks.json`](hooks.json))

Project hooks follow [Cursor Hooks](https://cursor.com/docs/hooks): JSON over stdin/stdout, `version: 1`, commands run from the **repo root**.

| Hook | Script | Purpose |
|------|--------|---------|
| `sessionStart` | [`hooks/session-start.cjs`](hooks/session-start.cjs) | Injects a short vault-first + `trading_bot` + skills + MCP validation brief (`additional_context`). |
| `postToolUse` | [`hooks/post-write-reminder.cjs`](hooks/post-write-reminder.cjs) | After `Write` / `StrReplace` / `MultiEdit`, reminds the agent to update `notes/reference/` or sessions when contracts change. |

**Debug:** Output panel → **Hooks**. After editing `hooks.json`, Cursor reloads automatically; restart Cursor if hooks do not attach.

**Note:** This repo’s [`.codex/hooks.json`](../.codex/hooks.json) targets **Codex** (different schema). **Cursor** loads only `.cursor/hooks.json`.

## Codex vs Cursor agents

- **Cursor Agent / Task tool:** uses Cursor rules (`.cursor/rules/*.mdc`) and these hooks; subagent types are e.g. `explore`, `shell`, `generalPurpose`.
- **Codex:** agent packs live in [`.codex/agents/*.toml`](../.codex/agents/); keep descriptions and `developer_instructions` aligned with the same startup path as hooks.
- **Claude Code:** subagents in [`.claude/agents/*.md`](../.claude/agents/).
