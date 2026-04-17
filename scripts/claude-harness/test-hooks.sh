#!/usr/bin/env bash
# Smoke-test harness hook scripts.
set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "▶ session-start-hook.cjs"
out=$(node .codex/scripts/session-start-hook.cjs)
node -e "
  const j = JSON.parse(process.argv[1]);
  if (j.hookSpecificOutput?.hookEventName !== 'SessionStart') {
    console.error('✗ unexpected shape:', JSON.stringify(j));
    process.exit(1);
  }
  console.log('✓ shape ok:', j.hookSpecificOutput.additionalContext.slice(0, 80) + '...');
" "$out"

echo "▶ install-mcp-config.cjs --help (existence check)"
if [ -f .codex/scripts/install-mcp-config.cjs ]; then
  echo "✓ install-mcp-config.cjs present"
else
  echo "✗ missing"
  exit 1
fi

echo "▶ graphify scripts present"
for s in graphify.mjs graphify-rebuild.mjs; do
  if [ -f ".codex/scripts/$s" ]; then
    echo "✓ $s present"
  else
    echo "✗ $s missing"
    exit 1
  fi
done

echo "▶ start-* MCP launchers present"
for s in start-desktop-commander.cjs start-birdeye-mcp.cjs start-firecrawl-mcp.cjs start-stdio-command.cjs; do
  if [ -f ".codex/scripts/$s" ]; then
    echo "✓ $s"
  else
    echo "✗ $s missing"
    exit 1
  fi
done

echo
echo "✓ All hook scripts pass smoke test"
