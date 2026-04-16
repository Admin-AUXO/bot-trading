---
name: session-bookends
description: Use for repo sessions that should start with a compact mini-agent brief, end with mini-agent note cleanup and handoff prep, and offload bounded basic tasks to gpt-5.4-mini agents.
---

# Session Bookends

Use this skill for non-trivial repo sessions where the main agent should stay focused on the critical path while smaller agents handle bootstrap compression, note hygiene, and other bounded sidecar work.

## Startup

1. Read the required repo bootstrap path first:
   `AGENTS.md`, `notes/README.md`, `notes/reference/index.md`, one task-relevant reference note, and one relevant durable note.
2. Before broad code reads, delegate a compact startup brief to a `gpt-5.4-mini` repo agent such as `session_briefer`.
3. Ask for a brief that includes only:
   current repo constraints, likely owning files or notes, recent handoff context, obvious risks, and any ambiguity that might change the implementation path.
4. Keep the brief compact enough that the main agent can act on it immediately.

## During The Session

- Prefer `gpt-5.4-mini` agents for bounded read-heavy or basic tasks:
  repo-contract audits, note curation, startup summaries, documentation cleanup, simple tracing, and other cheap sidecar work.
- Prefer `gpt-5.3-codex` agents for bounded write work once the owning files and execution path are already understood.
- Good repo defaults:
  `session_briefer`, `notes_curator`, `documentation_editor`, `repo_contract_auditor`, and `code_navigator` on `gpt-5.4-mini`;
  `implementation_worker`, `dashboard_handler`, and `docker_ops` on `gpt-5.3-codex`.
- Keep delegation shallow and specific.
- Do not hand a blocking critical-path task to a subagent if the main agent needs that answer immediately.
- Do not create overlapping write ownership between note-editing agents.
- Reserve larger models for high-risk review, safety, or judgment-heavy work.

## Closeout

1. Before the final response on substantive tasks, delegate documentation closeout to a `gpt-5.4-mini` repo agent such as `notes_curator`.
2. The closeout agent should update the smallest correct Obsidian surface:
   one canonical durable note, one session handoff if needed, and the nearest index if it changed.
3. The handoff should stay short:
   what changed, what was verified, what still smells wrong, and which durable note owns the lasting fact.
4. Review the doc diff before sending the final response.

## Platform Constraint

- The repo has a `SessionStart` hook reminder today.
- There is no repo evidence of a real session-end hook.
- Treat the closeout delegation as a required pre-final step, not as automatic hook behavior.
