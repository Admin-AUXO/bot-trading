---
name: "screenshot-analysis"
description: "Use when a task needs browser screenshots to inspect layout, compare before/after UI state, or turn visual findings into concrete layout edits."
---

# Screenshot Analysis

## Use When

- the user asks for a visual review, layout critique, compactness pass, or before/after UI check
- you need evidence from a live page instead of guessing from JSX

## Workflow

1. Capture the relevant page state with a reproducible command.
2. Open the screenshot with `view_image`.
3. Write down only the scan-critical findings:
   hierarchy
   wasted vertical space
   repeated information
   hidden primary action
   noisy empty state
   alignment or density issues
4. Turn findings into specific layout edits before patching code.
5. After edits, capture an after screenshot and compare the same region or flow.
6. In notes, keep only the conclusion, commands, and artifact paths. Do not paste raw image data or long visual narration.

## Commands

- Single page screenshot:
  `cd trading_bot/dashboard && npx playwright screenshot --device="Desktop Chrome" --full-page http://localhost:3100/<route> /tmp/<name>.png`
- If the page needs local state, load that state first and then take the screenshot from the same local URL.

## Rules

- Prefer the smallest screenshot set that answers the question.
- Check above-the-fold hierarchy first; most dashboard clutter problems are visible there.
- Distinguish structural problems from spacing problems. Reordering surfaces usually matters more than shaving padding.
- When comparing before and after, use the same route, viewport, and capture style.
- If extension-injected DOM causes hydration noise, treat that as environment noise unless the screenshoted UI itself is broken.
- Pair screenshot review with build verification before closing the task.
