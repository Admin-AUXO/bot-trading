---
type: investigation
status: active
area: codex
date: 2026-04-11
source_files:
  - AGENTS.md
  - notes/README.md
  - notes/reference/obsidian.md
graph_checked:
next_action: Use this note as the default MCP routing policy for future agent work and fold any lasting rules into the repo docs if the surface changes again.
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
