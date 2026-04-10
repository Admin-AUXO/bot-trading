---
type: reference
status: active
area: obsidian
date: 2026-04-10
source_files:
  - trading_bot/docker-compose.yml
  - .agents/skills/obsidian/SKILL.md
  - .codex/hooks.json
  - AGENTS.md
  - trading_bot/AGENTS.md
graph_checked:
next_action:
---

# Obsidian

Purpose: use Obsidian as the repo’s documentation and memory layer while keeping Graphify focused on code structure.

## What Is Confirmed

- Obsidian stores notes as Markdown files inside a local vault folder, and it refreshes when files change outside the app. Source: [How Obsidian stores data](https://obsidian.md/help/data-storage)
- Obsidian recommends opening an existing folder as a vault and warns against vaults within vaults. Source: [Create a vault](https://obsidian.md/help/vault), [How Obsidian stores data](https://obsidian.md/help/data-storage)
- LinuxServer’s image serves Obsidian over HTTPS by default at port `3001`, uses a self-signed certificate, and persists data under `/config`. Source: [linuxserver/obsidian README](https://github.com/linuxserver/docker-obsidian), [Docker Hub image page](https://hub.docker.com/r/linuxserver/obsidian)
- LinuxServer warns the container has no auth by default and includes terminal access in the GUI. Do not expose it to the public internet without stronger controls. Source: [linuxserver/obsidian README](https://github.com/linuxserver/docker-obsidian)
- Obsidian core plugins relevant to this repo workflow are current and official: Properties, Templates, Daily notes, Bases, Canvas, Graph view, and Obsidian URI. Sources: [Properties](https://help.obsidian.md/properties), [Templates](https://help.obsidian.md/Plugins/Templates), [Daily notes](https://help.obsidian.md/plugins/daily-notes), [Bases](https://help.obsidian.md/bases), [Canvas](https://help.obsidian.md/plugins/canvas), [Graph view](https://help.obsidian.md/plugins/graph), [Obsidian URI](https://help.obsidian.md/uri)

## Repo Position

- `notes/reference/` is the canonical doc set.
- `notes/` also stores durable memory for later Codex sessions.
- Graphify stays code-only and maps source structure.
- The Obsidian skill, AGENTS files, and hook reminder all assume vault-first reading and vault updates before a task is considered finished.

## Docker Setup In This Repo

Compose service: [`../../trading_bot/docker-compose.yml`](../../trading_bot/docker-compose.yml)

Start it:

```bash
cd trading_bot
docker compose --profile notes up -d obsidian
```

Open it:

- `https://127.0.0.1:3111`
- `http://127.0.0.1:3110` exists, but prefer HTTPS because the image is designed around it

Mounts:

- Named volume `obsidian-config` -> `/config`
- Repo notes folder `../notes` -> `/config/vaults/bot-trading`

First-run workflow inside Obsidian:

1. Open the existing folder `/config/vaults/bot-trading` as a vault.
2. Enable the core plugins you actually need: Properties, Templates, Daily notes, Bases, Canvas, Graph view.
3. Set the template folder to `templates/`.
4. Keep the vault rooted at `notes/`; do not create nested vaults.

## Active Codex Workflow

Before code:

1. Read [`../README.md`](../README.md)
2. Read [`index.md`](index.md)
3. Read the relevant reference doc
4. Read any relevant durable note under `../sessions/`, `../investigations/`, `../decisions/`, `../runbooks/`, or `../trading-memory/`
5. Read [`../../graphify-out/GRAPH_REPORT.md`](../../graphify-out/GRAPH_REPORT.md) if architecture context matters

After substantive work:

1. Update the matching reference note if a repo contract changed
2. Update the session note if handoff context matters
3. Update investigation, decision, runbook, or trading-memory notes if the task created durable knowledge

## Best Use Cases

- Session handoffs so later Codex runs do not rediscover the same context
- Strategy memory for threshold changes, recurring false positives, and lane-pacing lessons
- Provider memory for Birdeye and Helius quotas, latency patterns, and endpoint gotchas
- Execution memory for landing failures, wallet safety issues, and order-routing surprises
- Runbooks for startup, recovery, and verification procedures
- Decision logs for architecture or strategy choices that have already been argued once
- Investigations for bugs, suspicious metrics, and contradictory evidence
- Canvas maps for provider, runtime, or incident timelines when a linear note is too weak
- Bases views over frontmatter to track open investigations, stale runbooks, and active trading-memory notes

## Recommended Note Types

- `notes/reference/`: canonical repo contracts
- `notes/sessions/`: session handoffs
- `notes/investigations/`: debugging and analysis notes
- `notes/decisions/`: architecture and strategy decisions
- `notes/runbooks/`: repeatable operational procedures
- `notes/trading-memory/`: durable market, provider, execution, and strategy memory
- `notes/daily/`: daily working log
- `notes/maps/`: `.canvas` files for visual maps
- `notes/templates/`: Obsidian templates

## Recommended Properties

- `type`
- `status`
- `area`
- `date`
- `source_files`
- `graph_checked`
- `next_action`

## Safety

- Keep the service bound to localhost unless you add a real reverse proxy and stronger auth.
- Do not rely on Obsidian sync alone as backup. Obsidian’s own docs distinguish sync from backup. Source: [Back up your Obsidian files](https://obsidian.md/help/backup)
- Avoid symlink tricks inside the vault; Obsidian documents this as risky. Source: [Symbolic links and junctions](https://help.obsidian.md/symlinks)
