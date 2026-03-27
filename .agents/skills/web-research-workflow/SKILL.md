---
name: "web-research-workflow"
description: "Current-information research workflow for external docs, changelogs, APIs, and best practices with source-first synthesis and date awareness."
---

# Web Research Workflow

Use this skill when the task needs current external information.

## Goals
- Prefer primary sources and official documentation.
- Capture exact dates when information may have changed recently.
- Separate facts from inference.
- Return short, source-backed notes that another agent can act on.

## Preferred Tools
- `context7` for library and framework documentation.
- `fetch` for public docs and pages.
- `browsermcp` or `chrome_devtools` only when the page requires interaction.
- `time` when timezone or date normalization matters.
- `sequential_thinking` when the source set is ambiguous or conflicting.

## Output Shape
- What is confirmed.
- Source links.
- What remains uncertain.
- Recommended next step for the parent agent.
