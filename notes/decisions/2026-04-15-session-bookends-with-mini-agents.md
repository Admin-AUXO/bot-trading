---
type: decision
status: active
area: repo
date: 2026-04-15
source_files:
  - AGENTS.md
  - .codex/hooks.json
  - .codex/scripts/session-start-hook.cjs
  - .codex/agents/session_briefer.toml
  - .codex/agents/notes_curator.toml
  - .codex/agents/implementation_worker.toml
  - .agents/skills/session-bookends/SKILL.md
  - notes/reference/agent-workflow.md
  - notes/reference/tool-routing.md
graph_checked:
next_action: If Codex gains a real session-end hook, move the closeout reminder from procedure into hook-backed automation; until then keep the scripted startup hook and pre-final closeout rule aligned.
---

# Decision - Session Bookends With Mini Agents

## Problem

Repo sessions were paying too much prompt tax on startup rediscovery and too much main-agent time on note cleanup and handoff work.

The desired workflow was clear:

- start substantive sessions with a compact bootstrap summary from a small model
- end substantive sessions with a small-model pass over Obsidian notes and handoff docs
- use mini models for bounded basic tasks whenever they are the cheaper correct tool

## Decision

Adopt mini-agent session bookends plus model routing defaults for this repo:

- use a `gpt-5.4-mini` startup briefer after the required note/bootstrap reads and before broad code reads
- use a `gpt-5.4-mini` closeout agent such as `notes_curator` before the final response to update the owning note surface and prepare a concise handoff
- use `gpt-5.3-codex` workers for bounded implementation execution once the file surface is already understood
- keep the rule in the repo contract, the startup hook reminder, and a dedicated repo skill so future sessions can follow it consistently

## Why

- the startup brief keeps the main agent context compact and action-oriented
- closeout delegation makes note hygiene and handoff prep more reliable without stealing the main agent off the critical path
- bounded repo-facing tasks are usually better cost and latency fits for `gpt-5.4-mini` than for the main frontier model
- bounded implementation tasks are usually a better fit for `gpt-5.3-codex` than for `gpt-5.4`
- repo evidence only showed a startup hook, so shutdown work had to be expressed as procedure rather than fake automation

## Follow-Up

- Use `session_briefer` on non-trivial sessions after the mandatory startup read path.
- Use `notes_curator` before the final response when the task changed code, docs, or durable knowledge.
- Use `implementation_worker` when the code path is already understood and the delegated task is mainly write execution.
- Prefer mini agents for bounded read-heavy, note, and repo-contract work unless the task needs stronger judgment.
