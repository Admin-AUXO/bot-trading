---
type: session
status: active
area: repo
date: 2026-04-12
source_files:
  - .codex/hooks.json
  - notes/reference/obsidian.md
  - notes/sessions/index.md
graph_checked:
next_action: Keep the hook reminder short and vault-directed; if it grows into a wall of text again, cut it back instead of teaching the same rules twice.
---

# Session - Obsidian Hooks Hardening

## What Was Wrong

- The repo hook only matched `Bash`, so read and edit flows got no vault reminder.
- The hook command used shell-specific Bash syntax in a Windows-first repo.
- The existing reminder pointed vaguely at startup rules but did not push agents toward the actual Obsidian note that owns vault behavior.

## What Changed

- Replaced the shell-specific hook command with a portable `node -e` command.
- Widened the pre-tool matcher to `Bash|Read|Edit|Write|MultiEdit`.
- Added a post-edit reminder so repo-contract and setup changes get pushed back into `notes/`.
- Updated the canonical Obsidian reference note to document the hook behavior.

## What I Verified

- `.codex/hooks.json` parses as valid JSON.
- The hook messages now point to `notes/reference/obsidian.md` instead of duplicating repo rules inline.

## Durable Notes Updated

- `notes/reference/obsidian.md`
