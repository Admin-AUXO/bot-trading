---
type: runbook
status: active
area: providers/research
date: 2026-04-11
source_files:
  - .agents/skills/birdeye-discovery-lab/SKILL.md
  - trading_bot/backend/scripts/discovery-lab.ts
graph_checked: 2026-04-11
next_action: Re-check the fast-turn pump pack in another live window before treating the current winner as a runtime default.
---

# Runbook - Birdeye Discovery Lab

The procedure now lives in the repo skill:
[`.agents/skills/birdeye-discovery-lab/SKILL.md`](../../.agents/skills/birdeye-discovery-lab/SKILL.md)

Use the skill when you need repeatable Birdeye `meme/list` experiments instead of one-off curls.

## Main Command

```bash
cd trading_bot/backend
npm run lab:discovery -- --profile high-value --sources pump_dot_fun,moonshot,raydium_launchlab,meteora_dynamic_bonding_curve
```

## Durable Rules

- keep Birdeye API-side filters at five or fewer
- prefer source-specific runs before `source=all`
- use `--cache-ttl-seconds 0` when the tape moved or the cache is suspect
- inspect reject reasons before touching thresholds
- keep the durable takeaway in trading memory, not in the runbook
