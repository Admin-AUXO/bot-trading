# bot-trading — Claude Code Guide

This is a thin pointer. The authoritative project guide is [`AGENTS.md`](AGENTS.md) — read it first. It is harness-agnostic and applies equally to Claude Code, Codex, and other agents.

## Claude Code specifics

- **Project settings**: [`.claude/settings.json`](.claude/settings.json) (committed) — permissions, hooks, MCP allowlist.
- **Local overrides**: `.claude/settings.local.json` (gitignored).
- **Skills**: [`.agents/skills/`](.agents/skills/) — repo-owned, surface via `Skill` tool when names match.
- **MCP servers**: [`.mcp.json`](.mcp.json) — declarations mirror `.codex/config.toml`. Toggle which load via `enabledMcpjsonServers` in settings.
- **Hooks**: `SessionStart` runs `.codex/scripts/session-start-hook.cjs` (shared with Codex).

## Sub-package guides

- `trading_bot/` → [`trading_bot/CLAUDE.md`](trading_bot/CLAUDE.md) → [`trading_bot/AGENTS.md`](trading_bot/AGENTS.md)

## Maintenance

Run `bash scripts/claude-harness/run-all.sh` to lint skills, codex agents, MCP configs, and hooks.
