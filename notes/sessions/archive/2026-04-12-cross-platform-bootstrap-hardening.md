---
type: session
status: active
area: setup
date: 2026-04-12
source_files:
  - .gitattributes
  - README.md
  - notes/reference/bootstrap-and-docker.md
  - trading_bot/scripts/bootstrap-new-system.sh
  - trading_bot/scripts/bootstrap-new-system.ps1
  - trading_bot/scripts/sync-compose-env.sh
  - trading_bot/scripts/sync-compose-env.ps1
graph_checked:
next_action: Keep shell scripts LF-normalized and keep PowerShell and Bash env-sync behavior matched when setup flows change.
---

# Session - Cross-Platform Bootstrap Hardening

## What Was Wrong

- The Bash setup scripts were vulnerable to CRLF checkouts, which breaks Bash on macOS and other Unix environments.
- The Bash compose-env sync used `source`, which is brittle when `.env` values contain quotes or shell-significant characters.
- Both bootstrap flows treated `rg` like a hard requirement even though it was only used for a warning message.

## What Changed

- Added repo `.gitattributes` to force LF for `*.sh`.
- Rewrote the Bash bootstrap and compose-env scripts with LF-normalized content.
- Replaced shell `source` parsing in `sync-compose-env.sh` with key-based `.env` parsing that matches the PowerShell script more closely.
- Removed the unnecessary `rg` requirement from both bootstrap variants.
- Updated setup docs to make the PowerShell-vs-Bash split explicit.

## What I Verified

- `bash -n trading_bot/scripts/bootstrap-new-system.sh`
- `bash -n trading_bot/scripts/sync-compose-env.sh`
- PowerShell parser on both `.ps1` scripts
- matching generated `dashboard/compose.env` and `grafana/compose.env` outputs from the PowerShell and Bash sync scripts for the same sample env data

## Durable Notes Updated

- `README.md`
- `notes/reference/bootstrap-and-docker.md`
