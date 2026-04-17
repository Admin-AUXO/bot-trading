#!/usr/bin/env bash
# Run all harness lints + smoke tests. Exits non-zero if any step fails.
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

step() { echo; echo "════ $1 ════"; }

step "lint-skills"
node scripts/claude-harness/lint-skills.mjs

step "lint-codex-agents"
node scripts/claude-harness/lint-codex-agents.mjs

step "check-parity"
node scripts/claude-harness/check-parity.mjs

step "validate-mcp"
node scripts/claude-harness/validate-mcp.mjs

step "test-hooks"
bash scripts/claude-harness/test-hooks.sh

echo
echo "✓ All harness checks passed"
