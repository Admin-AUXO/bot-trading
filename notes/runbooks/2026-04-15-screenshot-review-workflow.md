---

## type: runbook

status: active
area: dashboard
date: 2026-04-15
source_files:

- .agents/skills/screenshot-analysis/SKILL.md
- trading_bot/dashboard
graph_checked:
next_action:

# Screenshot Review Workflow

Use the repo skill `[screenshot-analysis](../../.agents/skills/screenshot-analysis/SKILL.md)` when a dashboard task needs visual evidence instead of JSX-only guesses.

## Procedure

1. Capture the live page with Playwright:
  `cd trading_bot/dashboard && npx playwright screenshot --device="Desktop Chrome" --full-page http://localhost:3100/<route> /tmp/<name>.png`
2. Open the image in Codex with `view_image`.
3. Record only the visual conclusion in notes:
  what was hard to scan
   what was repeated
   what moved above the fold
   which actions became primary or secondary
4. After edits, recapture the same route and viewport.
5. Pair the visual check with `npm run build`.

## Notes Rule

- Keep screenshots as local artifacts, not embedded vault clutter.
- `output/` (repo root) and `trading_bot/output/` are gitignored; prefer `/tmp`, `artifacts/dashboard-screenshots/…` (capture script default), or an explicit `--output-dir`.
- In notes, store the route, capture command, image path, and conclusion.
- If the visual workflow becomes part of repeated repo work, keep procedure in the skill and leave this note as a pointer.

