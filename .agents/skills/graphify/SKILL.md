---
name: graphify
description: Use for the project-local code-graph workflow — `.codex/scripts/graphify*` wrappers, `graphify-out/` outputs, repo-scoped ignore rules. Run only when architecture or ownership context matters.
allowed-tools: Read, Grep, Glob, Bash
---

# $graphify

Use this skill for repo-local code graph work only.

This repo does not use Graphify as a general document or research corpus. The supported path is the checked-in local wrapper plus the code-only ignore rules in `.graphifyignore`.

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
- Read `graphify-out/GRAPH_REPORT.md` when the task needs architecture context, but do not mistake the graph for business truth.
- If `graphify-out/graph.json` does not exist yet, build it from repo root with `node ./.codex/scripts/graphify.mjs build-local .`.
- After code edits, run `node ./.codex/scripts/graphify-rebuild.mjs` only when a graph already exists.
- If the report looks noisy, verify against source code before repeating any graph claim in docs or chat.
- The `.sh` files remain as POSIX shims, but the Node wrappers are the supported cross-platform entrypoint for macOS and Windows.

## Outputs

- `graphify-out/graph.json`
- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/graph.html`
- `graphify-out/manifest.json`

## Not Supported By Default

- markdown corpora
- papers or screenshots
- repo-local semantic extraction with delegated subagents
- treating graph output as canonical product or strategy documentation
