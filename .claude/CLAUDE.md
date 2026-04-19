# Claude Code — bot-trading

The authoritative project guide is [`../AGENTS.md`](../AGENTS.md). Read it first. The notes below are Claude-specific only.

## Settings

| File | Role |
|------|------|
| [`settings.json`](settings.json) | Committed: permissions, hooks, MCP allowlist |
| `settings.local.json` | Gitignored: per-machine overrides |

## Skills (Skill tool)

Repo-owned skills live under [`../.agents/skills/`](../.agents/skills/). Each skill has a SKILL.md with YAML frontmatter (`name`, `description`). Each Claude skill should have a Codex counterpart under `../.codex/agents/`; run `node ../scripts/claude-harness/check-parity.mjs` to verify.

## MCP

Servers declared in [`../.mcp.json`](../.mcp.json). Set `enableAllProjectMcpServers: true` in settings to auto-load all enabled ones, or list them in `enabledMcpjsonServers`.

| Server | Default | Purpose |
|--------|---------|---------|
| `browsermcp` | on | Fallback browser automation |
| `desktop_commander` | on | File ops, processes |
| `birdeye-mcp` | on | Token/price data |
| `context7` | on | Library docs |
| `helius` | on | Solana RPC, smart money |
| `firecrawl` | on | Web scraping |
| `github` | on | GitHub repo, PR, issue, Actions |
| `grafana` | on | Local Grafana dashboards and alerts |
| `postgres` | on | DB reads |
| `fetch` | on | Exact page fetches |
| `time` | on | Current time and conversions |
| `chrome_devtools` | on | Primary browser automation |
| `shadcn` | on | shadcn component MCP |

## Hooks

`SessionStart` runs `../.codex/scripts/session-start-hook.cjs` — emits a startup nudge pointing at `AGENTS.md` and noting whether `graphify-out/` exists.

## MiniMax escape hatch (optional)

If you want to route a Claude Code session through **MiniMax M2.7-highspeed** (covered by your token plan) instead of Anthropic — useful for bounded one-off research that would otherwise burn Opus/Sonnet quota — set the following in your **user-scoped** `~/.claude/settings.json` (do NOT commit to this repo):

```jsonc
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.minimax.io/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "${MINIMAX_API_KEY}"
  }
}
```

Unset (or open a new terminal without the override) to return to Anthropic. The Codex equivalent is `codex --profile minimax-research` — see [`../.codex/config.toml`](../.codex/config.toml) and the `research_scout` Codex agent.

## Maintenance

```bash
bash scripts/claude-harness/run-all.sh   # lint skills, agents, MCP, hooks
node scripts/claude-harness/check-parity.mjs   # skill ↔ codex agent parity
```
