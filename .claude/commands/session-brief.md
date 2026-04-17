---
description: Produce a compact session-start brief — repo rules that matter now, likely owning files, recent handoff context, obvious risks.
argument-hint: [optional task hint]
---

Produce a compact session-start brief for this repo. Read in this order, minimum useful scope:

1. `AGENTS.md`
2. `notes/README.md`
3. `notes/reference/index.md`
4. The most recent active note in `notes/sessions/` (skip archive)
5. The reference doc most relevant to: $ARGUMENTS

Return a brief that includes only:
- repo rules that matter for this task
- the smallest likely owning file set
- recent handoff context worth knowing
- obvious risks or ambiguity that could change the implementation path

Cap the brief at 200 words. Do not open code unless the notes don't answer the question.
