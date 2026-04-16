---
type: reference
status: active
area: tooling
date: 2026-04-15
source_files:
  - AGENTS.md
  - trading_bot/AGENTS.md
  - notes/investigations/2026-04-11-mcp-surface-audit.md
  - .codex/config.toml
  - .codex/hooks.json
  - .codex/scripts/session-start-hook.cjs
  - .codex/agents/session_briefer.toml
  - .codex/agents/notes_curator.toml
  - .codex/agents/implementation_worker.toml
graph_checked:
next_action:
---

# Tool Routing

Purpose: keep future agents from wasting tokens by using overlapping tools for the same job.

Treat the repo `.codex/config.toml` as the shared project default. If a session is missing the expected MCP surface, install or refresh the managed user-scoped block with `node ./.codex/scripts/install-mcp-config.cjs`, then restart Codex.

The installer now supports startup profiles:

- `compact` default: keep startup lean and enable only the primary local file surface
- `db`: add `postgres` when schema or reporting truth matters
- `research`: add `context7`, `fetch`, and `time` for current-doc tasks
- `dashboard`: add browser and UI MCPs for dashboard execution work
- `provider`: add provider-facing MCPs plus lightweight fetch/time support
- `full`: enable the broader research and browser stack for tasks that truly need it

Use:

- `node ./.codex/scripts/install-mcp-config.cjs`
- `node ./.codex/scripts/install-mcp-config.cjs --profile db`
- `node ./.codex/scripts/install-mcp-config.cjs --profile research`
- `node ./.codex/scripts/install-mcp-config.cjs --profile dashboard`
- `node ./.codex/scripts/install-mcp-config.cjs --profile provider`
- `node ./.codex/scripts/install-mcp-config.cjs --profile full`

The shared `desktop_commander` launcher now skips Puppeteer and Playwright browser downloads during first-run package install. That avoids startup failures from optional browser payloads, but browser-backed export features may still need a host browser if you use them later.

Repo hook posture:

- hooks are enabled via `[features].codex_hooks = true`
- the checked-in repo hook surface currently uses `SessionStart`
- treat startup hooks as context injectors, not as autonomous subagent runners
- do not assume a real session-end hook exists unless the platform documents or proves it

## Shared Config Posture

- Default repo posture: `approval_policy = "on-request"`, `sandbox_mode = "workspace-write"`, `model_reasoning_effort = "medium"`, `plan_mode_reasoning_effort = "high"`, `personality = "pragmatic"`, and hooks enabled via `[features].codex_hooks = true`
- `fast` profile: lower reasoning for well-scoped tasks
- `mini` profile: switch the main agent to `gpt-5.4-mini` for lighter repo work
- `write` profile: switch the main agent to `gpt-5.3-codex` for implementation-heavy sessions in an already-understood surface
- `deep` profile: higher reasoning for difficult implementation or debugging
- `review` profile: higher reasoning plus `read-only` sandbox for review-heavy sessions
- `full_access` profile: explicit opt-in for `approval_policy = "never"` and `sandbox_mode = "danger-full-access"`

Keep the unrestricted profile off the default path. Reach for it only after the task and trust boundary are clear.

## Default Stack

- local files, directory search, note hygiene, and structured reads: `desktop_commander`
- shell commands, builds, tests, and long-running processes: terminal tools
- durable repo memory: Obsidian notes under `notes/`
- code structure and ownership: Graphify outputs under `graphify-out/`
- database schema and analytics truth: `postgres`
- exact external page fetches: `fetch`
- current technical library docs: `context7`
- browser verification and interaction: `chrome_devtools`
- Grafana dashboards, panels, rules, and datasource state: `grafana`
- dashboard component registry search and install flows: `shadcn`
- Solana, Helius, wallet, and chain-specific reads: `helius`
- simple timezone and current-time questions: `time`

## Startup Policy

- Default new-session profile: `compact`
- Keep helper MCPs installed but disabled until the task needs them.
- Do not pay startup cost for browser, research, or provider MCPs on normal local-code tasks.
- Keep the day-to-day execution baseline on-request/workspace-write; widen permissions only when the task actually needs it.
- Prefer repo-local skills under `.agents/skills/` over global skills for repo-specific procedures.

## Routing Rules

- Start local before going external.
- Use one tool that answers the question well instead of stacking three tools that partially overlap.
- Read notes before browsing. Read code before browser automation. Read schema before guessing analytics logic.
- Use the cheapest sufficient surface first.
- For ambiguous or planning-heavy work, prefer Plan mode before widening the file read surface, and use goal/context/constraints/done-when to frame the task.
- Use background terminals or task queues for long-running commands so terminal spam does not crowd the active thread.

## Browser Policy

- Repo-managed browser tool: `chrome_devtools`

Do not keep a second browser MCP in the shared repo block unless the primary browser surface proves inadequate.

## Memory Policy

- Durable repo facts belong in `notes/`.
- Do not store repo knowledge in `memory` unless the use case is deliberately cross-repo or personal.

Obsidian is the repo memory system. Parallel memory stores create drift.

## External Research Policy

- Use `context7` for current technical docs when the answer depends on a live library or framework contract.
- Use `fetch` for exact URLs, changelogs, and single-page primary-source confirmation.
- Use `shadcn` for dashboard UI work that needs registry-backed component discovery or install scaffolding; do not use it as a substitute for reading the repo's own dashboard primitives first.
- Do not browse before checking local notes and code when the answer is probably already in the repo.

## Domain Tool Policy

- Use `grafana` only for Grafana work. Prefer summary, property, and query-specific reads over whole-dashboard dumps.
- The local repo config runs `grafana` through Grafana’s official MCP Docker image against `http://host.docker.internal:3400`, which is the right host alias for Docker Desktop containers talking back to the local Grafana service.
- Use `shadcn` only for dashboard UI tasks. Keep it off the compact startup path, and expect install flows to require a valid `components.json` in the target app.
- The repo-managed MCP block intentionally omits GitHub because the shared GitHub Docker stdio path was host-sensitive and not reliable enough for the default surface here.
- For GitHub work in this repo, prefer the installed GitHub plugin skills and `gh` CLI; add a local GitHub MCP only after validating it on your own host.
- Use `helius` only when the task is genuinely Solana or provider-specific. Prefer read-only methods unless the user explicitly wants a risky operation.
- Use `git` MCP for routine VCS inspection. Use shell only when the MCP surface is insufficient.

## Agent Model Policy

- Use `gpt-5.4` for high-risk review, strategy, database, performance, and visual-UX judgment where wrong answers are expensive.
- Use `gpt-5.4-mini` for bounded read-heavy agents, startup summaries, note curation, repo-contract audits, and current-information research.
- Use `gpt-5.3-codex` for implementation-focused write agents when the task is mainly code change execution inside an already-understood surface.
- In this repo, default named examples are:
  `session_briefer`, `notes_curator`, `documentation_editor`, `repo_contract_auditor`, and `code_navigator` on `gpt-5.4-mini`;
  `implementation_worker`, `dashboard_handler`, and `docker_ops` on `gpt-5.3-codex`.
- Keep delegation shallow unless the task is genuinely parallel; extra agents are token burn disguised as thoroughness.

## Agent MCP Profiles

- `session_briefer`, `notes_curator`, `documentation_editor`, `repo_contract_auditor`, `code_navigator`:
  stay on `compact` unless the task itself widens
- `database_agent`:
  start from `db`
- `web_research`:
  start from `research`
- `dashboard_handler`, `dashboard_ui_ux_expert`:
  start from `dashboard`
- `trading_research`:
  start from `provider`
- `full`:
  use only when a single session truly needs several of those surfaces at once

## Anti-Patterns

- keeping duplicate browser or file MCPs in the shared repo block without a concrete need
- storing the same repo fact in Obsidian and `memory`
- using browser automation before reading code or notes
- using external tools to answer questions already covered by local docs or schema
- reading full dashboards, full note folders, or full code trees when a scoped read would do
