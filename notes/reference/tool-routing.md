---
type: reference
status: active
area: tooling
date: 2026-04-12
source_files:
  - AGENTS.md
  - trading_bot/AGENTS.md
  - notes/investigations/2026-04-11-mcp-surface-audit.md
  - .codex/config.toml
graph_checked:
next_action:
---

# Tool Routing

Purpose: keep future agents from wasting tokens by using overlapping tools for the same job.

## Default Stack

- local files, directory search, note hygiene, and structured reads: `desktop_commander`
- shell commands, builds, tests, and long-running processes: terminal tools
- durable repo memory: Obsidian notes under `notes/`
- code structure and ownership: Graphify outputs under `graphify-out/`
- database schema and analytics truth: `postgres`
- exact external page fetches: `fetch`
- browser verification and interaction: `chrome_devtools`
- Grafana dashboards, panels, rules, and datasource state: `grafana`
- GitHub repo, PR, issue, and Actions state: `github`
- Solana, Helius, wallet, and chain-specific reads: `helius`
- simple timezone and current-time questions: `time`

## Routing Rules

- Start local before going external.
- Use one tool that answers the question well instead of stacking three tools that partially overlap.
- Read notes before browsing. Read code before browser automation. Read schema before guessing analytics logic.
- Use the cheapest sufficient surface first.

## Browser Policy

- Default browser tool: `chrome_devtools`
- Fallback only: `browsermcp`

Do not spend tokens deciding between them on normal tasks. `chrome_devtools` is the default.

## Memory Policy

- Durable repo facts belong in `notes/`.

Obsidian is the repo memory system. Parallel memory stores create drift, so the repo config does not enable a separate `memory` MCP.

## External Research Policy

- Use `fetch` for exact URLs, changelogs, and single-page primary-source confirmation.
- Use repo notes first, then primary-source web fetches when the answer is version-sensitive and external.
- Do not browse before checking local notes and code when the answer is probably already in the repo.

## Domain Tool Policy

- Use `grafana` only for Grafana work. Prefer summary, property, and query-specific reads over whole-dashboard dumps.
- The local repo config runs `grafana` through Grafana’s official MCP Docker image against `http://host.docker.internal:3400`, which is the right host alias for Docker Desktop containers talking back to the local Grafana service.
- Use `github` for GitHub repo, PR, issue, and Actions work when the plugin skill surface is not the clearer route.
- The local repo config runs `github` through GitHub’s official MCP Docker image with a reduced toolset: `repos,issues,pull_requests,actions`.
- Use `helius` only when the task is genuinely Solana or provider-specific. Prefer read-only methods unless the user explicitly wants a risky operation.
- Use `git` MCP for routine VCS inspection. Use shell only when the MCP surface is insufficient.

## Codex CLI UX

- The repo config enables the `runtime_metrics` feature flag so the Codex CLI status line exposes more live run information in this project.
- Treat that as a local UX aid, not a repo contract. If the upstream CLI removes or renames the flag, cut or update it instead of keeping dead config.

## Agent Model Policy

- Use `gpt-5.4` for high-risk review, strategy, database, performance, and visual-UX judgment where wrong answers are expensive.
- Use `gpt-5.4-mini` for bounded read-heavy agents, note curation, repo-contract audits, and current-information research.
- Use `gpt-5.3-codex` for implementation-focused write agents when the task is mainly code change execution inside an already-understood surface.
- Keep delegation shallow unless the task is genuinely parallel; extra agents are token burn disguised as thoroughness.

## Anti-Patterns

- using both `browsermcp` and `chrome_devtools` on the same simple verification task
- using browser automation before reading code or notes
- using external tools to answer questions already covered by local docs or schema
- reading full dashboards, full note folders, or full code trees when a scoped read would do
