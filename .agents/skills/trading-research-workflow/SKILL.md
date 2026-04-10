---
name: "trading-research-workflow"
description: "Use for current research on Solana trading APIs, provider behavior, execution constraints, pricing, and protocol changes that could affect this repo's integrations or assumptions."
---

# Trading Research Workflow

Use this skill when current external facts about Birdeye, Helius, Solana, or execution constraints matter.

Do not use this skill for generic research. Use `web-research-workflow` when the topic is not specifically trading or provider related.

## Workflow

- Prioritize official docs, changelogs, pricing pages, and provider API references.
- Capture exact dates, version changes, and deprecations.
- Distinguish provider facts from strategy recommendations.
- Summarize impact on this repo's actual integrations, defaults, and dormant surfaces.
- Capture endpoint costs, quotas, or latency claims only from source-backed material.
- When pricing or quota docs change, map them back to this repo's current lane-budget assumptions instead of leaving them as abstract provider facts.
- Call out when a provider path appears redundant, deprecated, or unused in this repo.

## Output

- What changed or is confirmed now.
- Why it matters to this repo.
- Source links and dates.
