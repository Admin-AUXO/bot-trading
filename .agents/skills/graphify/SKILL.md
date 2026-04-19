---

## name: graphify
description: Use for the project-local code-graph workflow — `.codex/scripts/graphify*` wrappers, `graphify-out/` outputs, repo-scoped ignore rules. Run only when architecture or ownership context matters.
allowed-tools: Read, Grep, Glob, Bash

# $graphify

Use this skill for repo-local code graph work only.

## Use When

- you need architecture context before editing code
- you want to rebuild the repo graph after code changes
- you want to query the existing code graph for symbols or ownership boundaries

## Supported Commands

```bash
node ./.codex/scripts/graphify.mjs build-local .
node ./.codex/scripts/graphify-rebuild.mjs
node ./.codex/scripts/graphify.mjs query "RiskEngine"
node ./.codex/scripts/graphify.mjs hook status
```

## Rules

- Always use the repo-local wrapper in `.codex/scripts/`.
- Treat the repo graph as code-only.
- Do not promise a semantic doc or image pass; the local runner excludes markdown, images, and other non-code files.
- After code edits, run `node ./.codex/scripts/graphify-rebuild.mjs` only when a graph already exists.
- If the report looks noisy, verify against source code before repeating any graph claim in docs or chat.
- The `.sh` files remain as POSIX shims, but the Node wrappers are the supported cross-platform entrypoint for macOS and Windows.

## Outputs

All files are auto-generated from `graphify-out/GRAPH_SCHEMA.json`.

- `graphify-out/GRAPH_QUICKREF.md` - Ultra-compact entry point (start here)
- `graphify-out/GRAPH_MAPS.md` - Cross-boundary maps (ownership, module seams)
- `graphify-out/GRAPH_SKILLS.md` - Skill selector (maps tasks to relevant code areas)
- `graphify-out/GRAPH_ACTIONS.md` - State mutation catalog (entry points, writes, side effects)
- `graphify-out/GRAPH_WORKFLOWS.md` - Data flow diagrams (request → service → DB)
- `graphify-out/GRAPH_CLIENTS.md` - External client directory (HTTP, SDK, wallet, provider)
- `graphify-out/GRAPH_REPORT_COMPACT.md` - Token-optimized markdown (LLM-friendly)
- `graphify-out/GRAPH_SCHEMA.json` - Machine-readable schema (programmatic access)
- `graphify-out/graph.json` - Raw NetworkX graph export
- `graphify-out/manifest.json` - File manifest

## Usage

| Need | Use |
|------|-----|
| Quick context | `GRAPH_QUICKREF.md` |
| "Where is X implemented" | `GRAPH_ACTIONS.md` |
| Data flow understanding | `GRAPH_WORKFLOWS.md` |
| Skill selection | `GRAPH_SKILLS.md` |
| API/client reference | `GRAPH_CLIENTS.md` |
| Cross-boundary architecture | `GRAPH_MAPS.md` |

## Optimization Pipeline

The graph generation includes a multi-agent optimization pipeline:

1. **DataPruner** - removes duplicate hub entries, normalizes "Tradingbot/Src" → "TB/Src"
2. **SchemaOptimizer** - creates structured JSON schema with semantic types
3. **SemanticEnricher** - adds cross-community bridges, centrality scores, semantic tags

For LLM agents: use `GRAPH_SCHEMA.json` for programmatic access or the topic-specific markdown files above.

## Not Supported By Default

- markdown corpora, papers, screenshots
- treating graph output as canonical product or strategy documentation
