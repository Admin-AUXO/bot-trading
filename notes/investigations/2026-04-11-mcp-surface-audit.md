---
type: investigation
status: active
area: codex
date: 2026-04-11
source_files:
  - AGENTS.md
  - notes/README.md
  - notes/reference/agent-workflow.md
  - notes/reference/tool-routing.md
  - notes/reference/obsidian.md
  - .codex/config.toml
  - .codex/hooks.json
  - .codex/scripts/session-start-hook.cjs
  - .codex/agents/
  - .codex/scripts/install-mcp-config.cjs
  - .codex/scripts/start-birdeye-mcp.cjs
  - trading_bot/AGENTS.md
  - .codex/log/codex-tui.log
graph_checked:
next_action: Re-run the direct shell-side Birdeye MCP newline-JSON probe from a fresh top-level session so the local opt-in path can be classified as working or broken on this macOS host instead of left half-validated.
---

# MCP Surface Audit

Purpose: audit the MCP servers available in this Codex environment for overlap, token efficiency, and operational risk.

## What Is Actually Available

Configured MCP server surface in this environment:

- `browsermcp`
- `chrome_devtools`
- `context7`
- `desktop_commander`
- `fetch`
- `git`
- `grafana`
- `helius`
- `memory`
- `postgres`
- `shadcn`
- `time`

Resource discovery today is thin:

- resource publishers: `desktop_commander`, `postgres`
- resource templates: none

## Default Routing

Use this default stack unless the task gives a better reason:

- local files and repo search: `desktop_commander`
- shell commands, builds, tests, and process control: terminal tools
- repo docs and durable memory: Obsidian notes under `notes/`
- code structure and ownership: Graphify outputs under `graphify-out/`
- SQL/schema inspection: `postgres`
- exact URL fetches: `fetch`
- technical library docs: `context7`
- browser automation: prefer `chrome_devtools`
- Grafana state and dashboards: `grafana`
- Helius and Solana-specific reads: `helius`
- dashboard component registry search and install flows: `shadcn`
- simple time conversion/current time: `time`

## Audit By Server

### `desktop_commander`

Verdict: keep and use heavily.

Strengths:

- best local file reader/editor surface
- safer and cheaper than pasting shell output for file work
- strong for directory listing, search, and structured reads

Risks:

- can become noisy if agents use it like a file dump instead of scoped reads

Best practice:

- prefer focused reads and search over whole-file or whole-tree dumps

### `postgres`

Verdict: keep and use heavily.

Strengths:

- direct schema and query access beats guessing from Prisma or docs
- low-token route for analytical questions when compared with reading app code

Risks:

- agents can still write bad SQL logic even with the right tool

Best practice:

- prefer schema-aware SQL inspection before reading dashboard or backend reporting code

### `context7`

Verdict: keep and use selectively.

Strengths:

- best path for current technical docs without broad web search
- bounded enough to discourage noisy research

Risks:

- still expensive if agents query it before checking local docs or code

Best practice:

- use only when the answer is external, version-sensitive, and technical

### `fetch`

Verdict: keep and use selectively.

Strengths:

- fast for exact URLs and primary-source retrieval
- cheaper than full browser automation for plain content fetches

Risks:

- agents can misuse it for broad research that should start with local docs or `context7`

Best practice:

- use for known URLs, changelogs, raw docs, and single-page confirmation

### `shadcn`

Verdict: keep installed but off the compact path; enable for dashboard UI work.

Strengths:

- gives agents a registry-aware path to browse, search, and install shadcn-compatible components instead of hand-rolling common UI scaffolding
- matches the dashboard stack well enough to be useful because the app already uses Next.js, React, Tailwind, and Radix primitives

Risks:

- it is not a substitute for the repo's own UI contract, typography choices, or existing dashboard primitives
- install flows depend on a valid `components.json`, which this repo does not currently ship under `trading_bot/dashboard/`

Best practice:

- keep it disabled in `compact` and `db` profiles
- enable it in `full` only, and reach for it after reading `notes/reference/dashboard-operator-ui.md` plus the existing dashboard component surface

### `github`

Verdict: keep configured, but disabled by default in the shared repo config because it is broken on this Windows Codex host.

Strengths:

- direct PR, issue, repo, and Actions access
- cleaner than shelling raw `gh` for common GitHub inspection

Risks:

- overlaps with the installed GitHub plugin skill surface if agents use both casually
- current GitHub Docker stdio transport is not MCP-framed stdio, so Codex CLI startup fails before initialize completes

Best practice:

- prefer one GitHub surface per task
- use the GitHub plugin skills or `gh` CLI for current GitHub work on Windows hosts in this repo
- keep the shared MCP block disabled by default until transport compatibility is fixed upstream or verified per host
- allow macOS users to opt in locally by setting `enabled = true` only after they validate the transport on their own machine

## 2026-04-12 GitHub MCP Finding

Probe result against `ghcr.io/github/github-mcp-server v0.33.0`:

- sending a standard framed MCP stdio initialize request beginning with `Content-Length:` makes the server exit with `invalid character 'C' looking for beginning of value`
- sending raw newline-delimited JSON succeeds and returns a valid initialize payload

Conclusion:

- on this Windows host, the current GitHub Docker `stdio` server is not compatible with the framed stdio contract Codex CLI 0.120.0 is using
- that host-specific mismatch explains the session warning: `handshaking with MCP server failed: connection closed: initialize response`
- macOS support is not disproven by this probe; treat it as unverified until someone validates it there

## 2026-04-12 Shared Config Repair

The shared repo config had three self-inflicted failures:

- the custom agent files under `.codex/agents/` used shorthand blocks like `[mcp_servers.filesystem] enabled = true`
- Codex CLI 0.120.0 loads custom agent files as config layers, so each `mcp_servers.<id>` entry must define a real transport such as `command` or `url`
- those shorthand blocks therefore fail deserialization with `invalid transport` before the agent can even spawn

Fix applied:

- removed the stub `mcp_servers.*` blocks from the custom agent files and let them inherit MCP availability from the parent session, which is the behavior the current subagent docs describe for omitted fields
- switched `.codex/scripts/start-birdeye-mcp.cjs` to use `npx.cmd` on Windows and `npx` elsewhere so the wrapper is host-portable
- disabled `birdeye-mcp` in the shared repo config by default because it requires a local `BIRDEYE_API_KEY`; that keeps fresh clones and non-Birdeye tasks from emitting startup noise
- raised the shared `chrome_devtools` startup timeout to 45 seconds so package resolution and browser attach do not fail on slower hosts

Current repo contract:

- custom agent files may include full MCP server definitions, but they must not use stub `enabled = true` transport-less blocks
- secret-backed or host-sensitive MCP servers belong in shared config only when they are disabled by default or otherwise safe on a fresh machine
- macOS users can enable `birdeye-mcp` locally after exporting `BIRDEYE_API_KEY` and validating the wrapper on their host

## 2026-04-13 Repo Config Discovery Finding

Codex CLI `0.119.0-alpha.28` on this macOS host does not auto-load the repo-local `.codex/config.toml`.

Observed behavior:

- `codex mcp list` returned `No MCP servers configured yet` even though the repo template defined MCP servers
- CLI help for this build points config overrides at `~/.codex/config.toml`, not the repo-local template

Fix applied:

- added `./.codex/scripts/install-mcp-config.cjs` to install a managed `bot-trading` MCP block into the real user config at `~/.codex/config.toml`
- switched the shared MCP launch commands to cross-platform Node wrappers so the installed block works on both macOS and Windows without relying on `npx` or `uvx` shell quirks
- updated the repo docs to treat `.codex/config.toml` as a template plus source of truth for the installer, not as an auto-loaded config surface

Current repo contract:

- if MCP servers appear missing, run `node ./.codex/scripts/install-mcp-config.cjs` and restart Codex before debugging individual server transports
- treat the user config as the live MCP registry and the repo `.codex/config.toml` as the checked-in template

## 2026-04-13 Desktop Commander Startup Repair

Observed behavior on this macOS host:

- `desktop_commander` died during first-run `npx` install because `puppeteer` postinstall ran before the MCP server could finish booting
- Codex session init then lost the file-focused MCP surface even though the rest of the registry loaded

Fix applied:

- added `.codex/scripts/start-desktop-commander.cjs` as a dedicated launcher
- forced `PUPPETEER_SKIP_DOWNLOAD=1` and `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` for that server so optional browser payloads do not block MCP startup
- raised the shared `desktop_commander` startup timeout from 30 seconds to 90 seconds in both the repo template and the managed installer output

Current repo contract:

- `desktop_commander` should start without waiting for browser binary downloads on fresh hosts
- if someone later needs browser-backed export features from that package, validate host browser availability separately instead of weakening MCP startup defaults

## 2026-04-13 Initial Context Optimization Pass

Observed behavior on this macOS host:

- the managed `~/.codex/config.toml` block still enabled a wide MCP surface for every new session
- that meant browser, research, provider, and helper tools were present even on simple local doc or code tasks
- the repo guidance said to stay lean, but the live config still paid startup and routing tax up front

Fix applied:

- changed the repo `.codex/config.toml` template to a compact-by-default policy
- updated `./.codex/scripts/install-mcp-config.cjs` to support `compact`, `db`, and `full` profiles
- made `compact` the installer default so fresh sessions only enable the primary local file MCP surface

## 2026-04-15 Hook And Model-Routing Findings

Observed behavior from repo evidence plus local CLI inspection:

- the checked-in repo hook surface still only defines `SessionStart`
- the hook payload is just additional context text; the hook is not itself a verified autonomous subagent runner
- local `codex --help` and `codex debug --help` exposed normal config and debug controls but no obvious session-end hook surface on this host
- official OpenAI help content found during research confirmed that Codex model availability depends on product surface and configuration, but did not surface a hook lifecycle document for session-end behavior

Fix applied:

- replaced the brittle inline shell JSON in `.codex/hooks.json` with a dedicated `./.codex/scripts/session-start-hook.cjs`
- kept the repo contract explicit that startup is hook-assisted while shutdown remains a pre-final procedure
- added repo profiles for `mini` and `write` so the main agent can be switched intentionally to `gpt-5.4-mini` or `gpt-5.3-codex`
- added a general `implementation_worker` so `gpt-5.3-codex` is available outside dashboard-only or Docker-only tasks

Current repo contract:

- startup hooks may inject context, but they are not trusted as a replacement for explicit main-agent orchestration
- do not claim a real session-end hook exists unless the platform documents or proves it
- use `gpt-5.4-mini` for bounded read-heavy and note tasks, `gpt-5.3-codex` for bounded implementation execution, and `gpt-5.4` for high-risk judgment-heavy work
- documented structured prompts, ask mode, task queues, background terminals, compaction, and lightweight git checkpoints in the canonical startup docs
- documented the repo-local skill policy explicitly: prefer `.agents/skills/` and avoid global skill drift for repo-specific procedures

Current repo contract:

- run `node ./.codex/scripts/install-mcp-config.cjs` for the compact default
- run `node ./.codex/scripts/install-mcp-config.cjs --profile db` when `postgres` should be live at startup
- use the targeted installer profiles before reaching for `full`
- run `node ./.codex/scripts/install-mcp-config.cjs --profile full` only when the task truly needs several specialized MCP surfaces at once

## 2026-04-15 Token-Optimization Pass

Observed problems:

- the managed repo MCP block still carried several overlapping or discouraged surfaces even though repo guidance already preferred a smaller set
- `compact`, `db`, and `full` left a large gap between too little and too much for common agent families like dashboard work, provider research, and web-doc research
- `session_closer` overlapped heavily with the already-existing `notes_curator`

Fix applied:

- removed `browsermcp`, `filesystem`, `memory`, and `sequential_thinking` from the shared repo-managed MCP block
- kept `chrome_devtools` as the only repo-managed browser MCP surface
- removed the repo-managed GitHub MCP block and treated GitHub as a local opt-in or `gh`/plugin concern instead of shared startup surface
- added targeted installer profiles: `research`, `dashboard`, and `provider`
- kept `compact` as the default and left `full` as the deliberate wide-net option
- removed the redundant `session_closer` agent and routed closeout guidance to `notes_curator`
- trimmed `session_briefer` to only the one repo skill it actually needs

Current repo contract:

- repo-managed MCP should favor one primary surface per job and avoid helper duplicates
- use targeted installer profiles before reaching for `full`
- keep note closeout on `notes_curator`; do not preserve near-duplicate repo agents unless they materially change behavior

## 2026-04-13 Birdeye MCP Local Opt-In Follow-Up

Observed behavior on this macOS host:

- the live `~/.codex/config.toml` Birdeye entry could be flipped to `enabled = true`
- plain `codex mcp get birdeye-mcp` still reported the server as disabled in the current shell context
- forcing `-c mcp_servers.birdeye-mcp.enabled=true` made `codex mcp get birdeye-mcp` report the expected live stdio config
- a fresh `codex exec` subprocess with that same override discovered the Birdeye tool surface and attempted:
  `birdeye-mcp/get-defi-v3-token-meme-list`
- the actual nested MCP tool call failed twice with:
  `user cancelled MCP tool call`
  and the nested agent reported:
  `birdeye-mcp server is unavailable`
- a direct shell-side newline-delimited JSON probe against `.codex/scripts/start-birdeye-mcp.cjs` was started, but this session ended before that probe returned a final result

Conclusion:

- the local opt-in path is good enough for fresh subprocess discovery when the enable override is explicit
- this session did not reconfirm stable Birdeye MCP tool execution on macOS
- if Birdeye MCP matters for a task, prefer a fresh top-level Codex session after enabling it rather than judging availability from a stale thread-local registry or a nested `codex exec` fallback

### `chrome_devtools`

Verdict: keep as the default browser tool.

Strengths:

- richer browser control than `browsermcp`
- better fit for verification, snapshots, and precise UI inspection

Risks:

- browser automation is always token-expensive if agents use it before reading code

Best practice:

- make this the default browser layer for dashboard verification and reproduction

### `browsermcp`

Verdict: keep only as secondary fallback.

Strengths:

- useful if the Chrome DevTools flow misbehaves on a particular interaction

Risks:

- duplicates browser capability already covered better by `chrome_devtools`
- increases routing ambiguity for future agents

Best practice:

- do not default to this when `chrome_devtools` can do the job

### `grafana`

Verdict: keep and use heavily for Grafana work.

Strengths:

- high-value repo-specific surface for dashboards, panels, rules, annotations, and datasource discovery
- better than shelling raw API calls

Risks:

- full dashboard fetches are context-heavy
- write operations can be noisy or dangerous if used casually

Best practice:

- prefer summary/property/query-specific endpoints over whole-dashboard reads

### `helius`

Verdict: keep, but use with clear guardrails.

Strengths:

- strong repo-specific leverage for Solana, wallet, transaction, and provider work
- useful for current docs and live chain inspection

Risks:

- credit costs vary sharply
- includes write and transfer operations with real-world consequences
- too easy to over-query when a local note or code path already answers the question

Best practice:

- default to read-only methods
- treat webhook management, plan changes, and transfer actions as explicit-risk operations

### `git`

Verdict: keep and prefer for common structured VCS actions.

Strengths:

- safer than improvising raw git commands for common status, diff, branch, and commit flows

Risks:

- incomplete coverage for more complex git investigation still pushes agents to shell

Best practice:

- use MCP git for routine state and diff inspection; drop to shell only when needed

### `memory`

Verdict: de-emphasize for this repo.

Strengths:

- useful for personal or cross-repo memory when Obsidian is not the canonical store

Risks:

- duplicates the repo’s actual durable memory system in `notes/`
- creates fact drift if both vault and memory graph are updated

Best practice:

- for this repo, prefer Obsidian notes over memory MCP for durable project knowledge

### `time`

Verdict: keep.

Strengths:

- tiny utility, low risk, low cost

Risks:

- none worth caring about

## Main Problems

### 1. Browser overlap

`chrome_devtools` and `browsermcp` both exist, but one should be the default. Otherwise agents waste tokens deciding how to click a button.

Recommendation:

- standardize on `chrome_devtools`
- use `browsermcp` only as fallback

### 2. Memory overlap

`memory` duplicates the repo’s actual memory system: Obsidian plus trimmed reference and investigation notes.

Recommendation:

- keep repo memory in `notes/`
- avoid parallel memory storage unless the use case is clearly cross-repo or personal

### 3. Thin resource discovery

Only `desktop_commander` and `postgres` publish resources, and there are no templates.

Effect:

- discoverability is weak
- future agents still need routing rules in docs instead of learning from MCP metadata alone

### 4. Risk asymmetry

Some MCPs are harmless utilities; others can move money, change plans, or mutate dashboards.

Recommendation:

- treat `helius` write paths and `grafana` mutations as guarded operations, not casual exploration tools

## Recommended Default Policy

For future agents in this repo:

- use Obsidian for durable repo knowledge
- use Graphify for code structure only
- use `desktop_commander` for local files and search
- use `postgres` for analytics/schema truth
- use `context7` or `fetch` only when the answer is external
- use `chrome_devtools` as the default browser tool
- use `browsermcp` only as fallback
- use `grafana` and `helius` only when the task is specifically about those systems
- avoid storing repo facts in `memory` unless there is a deliberate cross-repo reason

## Bottom Line

The MCP problem is not missing tools. It is routing discipline.

The efficient stack for this repo is:

- Obsidian for memory
- Graphify for structure
- Desktop Commander for files
- Postgres for data truth
- Chrome DevTools for browser verification
- Grafana and Helius only when the task truly needs their domain

Anything broader than that is how agents waste context and pretend it is research.

## 2026-04-14 Shared Session Posture Refresh

Observed drift:

- the shared repo template still defaulted to `approval_policy = "never"`, `sandbox_mode = "danger-full-access"`, and `model_reasoning_effort = "high"` even though the repo guidance said to start compact and widen only when needed
- `.codex/hooks.json` existed, but the config surface did not explicitly enable Codex hooks
- the repo instructions still pushed “ask mode” plus `title/description/context` instead of preferring Plan mode and a clearer prompt contract

Fix applied:

- changed the repo template and live user config baseline to `approval_policy = "on-request"`, `sandbox_mode = "workspace-write"`, and `model_reasoning_effort = "medium"` for normal work
- added explicit `fast`, `deep`, `review`, and `full_access` profiles so speed, heavier reasoning, reviews, and unrestricted execution are opt-in instead of the default path
- enabled hooks with `[features].codex_hooks = true`
- rewrote the canonical workflow guidance around Plan mode plus `goal/context/constraints/done-when`

Current repo contract:

- normal implementation work should start from the safer shared baseline and only widen permissions or reasoning when the task actually requires it
- review-heavy work should prefer the `review` profile over ad hoc full-access sessions
- if a session is missing the expected MCP surface, refresh the managed block with `node ./.codex/scripts/install-mcp-config.cjs` instead of guessing at per-server failures

## 2026-04-15 Hook Contract Fix

Observed behavior on this macOS host:

- the repo-local `.codex/hooks.json` used a `PreToolUse` Bash hook that returned `permissionDecision = "allow"` together with a reminder message
- `codex-cli 0.120.0` rejected that output with `unsupported permissionDecision:allow`, so the reminder hook surfaced as a recurring failure
- the reminder also fired on every Bash tool call, which was the wrong lifecycle point for startup-order guidance

Fix applied:

- replaced the `PreToolUse` reminder with a `SessionStart` hook scoped to `startup|resume`
- changed the output shape to `hookSpecificOutput.additionalContext`, which the current hooks docs support for `SessionStart`
- removed the unsupported `permissionDecision = "allow"` path entirely

Current repo contract:

- use `SessionStart` or `UserPromptSubmit` for lightweight guidance that should shape the turn without acting like a permission gate
- reserve `PreToolUse` for real Bash interception, and only use supported outputs there such as `systemMessage` or `permissionDecision = "deny"`
