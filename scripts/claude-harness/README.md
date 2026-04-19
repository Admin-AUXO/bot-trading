# Claude/Codex Harness Scripts

Maintenance & smoke-test scripts for the agent harness config in this repo
(`.claude/`, `.codex/`, `.agents/`, `.mcp.json`). Pure Node.js + Bash, no deps.

| Script | Purpose | Exit non-zero on |
|--------|---------|------------------|
| `lint-skills.mjs` | Validate `.agents/skills/*/SKILL.md` frontmatter | missing/invalid frontmatter |
| `lint-codex-agents.mjs` | Validate `.codex/agents/*.toml` required keys | missing required key |
| `check-parity.mjs` | Skill ↔ Codex agent parity matrix | unmapped pair on either side |
| `validate-mcp.mjs` | Cross-check `.mcp.json` / `.cursor/mcp.json` / `.claude/settings.json` / `.codex/config.toml` | doc reference without declaration |
| `test-hooks.sh` | Smoke-test SessionStart hook + presence of helper scripts | hook returns wrong shape |
| `run-all.sh` | Run everything sequentially | any step fails |

## Usage

From repo root:

```bash
bash scripts/claude-harness/run-all.sh           # full pass
node scripts/claude-harness/check-parity.mjs     # single check
```

## When to run

- After adding/renaming a skill or codex agent → `check-parity.mjs`
- After editing MCP config → `validate-mcp.mjs`
- After editing hooks or harness scripts → `test-hooks.sh`
- Before committing harness changes → `run-all.sh`

## Suggested npm alias

Add to root `package.json` if/when one exists:

```json
{ "scripts": { "lint:harness": "bash scripts/claude-harness/run-all.sh" } }
```
