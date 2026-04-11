---
type: investigation
status: active
area: repo
date: 2026-04-11
source_files:
  - .codex/config.toml
  - .codex/hooks.json
  - .codex/agents/
  - .agents/skills/
  - README.md
  - notes/reference/bootstrap-and-docker.md
  - trading_bot/docker-compose.yml
  - graphify-out/GRAPH_REPORT.md
graph_checked: 2026-04-11
next_action: Keep the new session archive, compose-env split, and repo-local skill surface honest as the repo changes; the graph report is now trimmed, so the next obvious cleanup is only deeper label quality if the community names keep drifting into generic `Tradingbot / Src` sludge.
---

# Investigation - Repo Ops And Agent Audit

## Scope

Audit the non-app surface only:

- Codex setup
- repo-local skills and agent configs
- graphify
- Obsidian and notes
- Docker setup outside backend and dashboard source

## What Was Wrong

- Many repo-local skills, custom agents, and the output style still pointed at the deleted `docs/` tree instead of `notes/reference/`.
- Repo docs contradicted reality in a few important places:
  the root README still claimed there was no Grafana service in Compose,
  and the Grafana skill still claimed the repo shipped no Grafana assets.
- The default Codex repo config spent `high` reasoning effort on every task, even though the repo already had `deep` and `review` profiles for heavier work.
- The Bash hook repeated the full startup-order speech on every shell call instead of pointing agents back to the canonical repo rules.
- The Docker reference note understated env exposure; `dashboard` and `grafana` also consume `trading_bot/backend/.env` today.
- Notes are functionally useful but too duplicated by workstream, especially around dashboard implementation and Birdeye discovery research.
- The repo-local graphify workflow is currently code-only, but the checked-in skill still mixes that with a much larger upstream semantic-agent workflow that is not the reliable default path here.

## Changes Applied In This Pass

- Repointed repo-local skill docs from `docs/...` to `notes/...` or `notes/reference/...`.
- Repointed custom agent instructions from `docs/...` to the canonical vault docs.
- Updated the repo output style to reference the vault-first read path.
- Downgraded the read-only `trading_research` agent from `gpt-5.4` to `gpt-5.4-mini`.
- Lowered the repo-default reasoning effort from `high` to `medium` while leaving the explicit `deep` and `review` profiles on `high`.
- Shortened the Bash hook reminder so it stops paying full prompt tax for instructions that already live in `AGENTS.md`.
- Removed the stale root README claim that Compose has no Grafana service.
- Updated the Grafana skill so it reflects the current repo: Grafana exists, but it is still a secondary RCA surface.
- Corrected the Docker reference note so it matches the current env blast radius.
- Rewrote the repo-local skills into shorter repo-owned contracts and removed the obsolete Grafana repo skill.
- Added dedicated `gpt-5.4-mini` agents for notes curation, repo contract audits, graph hygiene, and Docker contract checks.
- Split Compose env exposure so `dashboard` and `grafana` use generated service env files instead of inheriting the full backend env.
- Added checked-in service env examples and a sync script to regenerate the runtime files from `backend/.env`.
- Collapsed active session notes into dashboard and provider/runtime summaries, then archived the dead handoffs.
- Pinned the Obsidian sidecar image and cleaned the repo-local graph report so it stops surfacing empty and tiny communities as first-class architecture.

## Remaining Smells

- Community labels in `GRAPH_REPORT.md` are cleaner but still generic in places because the extractor sees many `src/`-heavy paths and helper clusters.
- Vault routing is much leaner now, but `notes/reference/agent-workflow.md` can still be shortened further if you want one even stricter canonical routing note.
- The Grafana decision note is still bigger than it should be. It is no longer a blocker, just the next fat document worth trimming.
