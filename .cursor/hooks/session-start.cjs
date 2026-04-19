#!/usr/bin/env node
/**
 * Cursor sessionStart hook — injects compact repo bootstrap into agent context.
 * @see https://cursor.com/docs/hooks (sessionStart → additional_context)
 */
const fs = require("node:fs");

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => resolve(chunks.join("")));
  });
}

readStdin()
  .then((raw) => {
    try {
      JSON.parse(raw || "{}");
    } catch {
      /* ignore malformed stdin; still emit safe defaults */
    }

    const hasGraphReport = fs.existsSync("graphify-out/GRAPH_REPORT.md");
    const graphLine = hasGraphReport
      ? "Graphify: use `graphify-out/GRAPH_REPORT.md` only when architecture or ownership is unclear — not as a default first read."
      : "Graphify: skip unless ownership is ambiguous; build locally with repo graphify scripts when needed.";

    const additional_context = [
      "## bot-trading agent brief (`.cursor/hooks/session-start.cjs`)",
      "",
      "1. Read `AGENTS.md`, then `notes/README.md` → `notes/reference/index.md`, then **one** task-specific `notes/reference/*.md` plus **one** durable note under `notes/sessions/`, `notes/investigations/`, `notes/decisions/`, or `notes/trading-memory/` before broad code exploration.",
      "2. Changes under `trading_bot/` also follow `trading_bot/AGENTS.md`.",
      "3. Strategy or risk claims: verify against `notes/reference/strategy.md` **and** the engine code that enforces them.",
      "4. `draft_*.md` vs shipped code: skim `notes/reference/drafts-and-implementation-truth.md` before treating drafts as current spec.",
      "5. When a task matches an `.agents/skills/**/SKILL.md` YAML `description`, read that skill before improvising.",
      "6. MCP server **names** in `.cursor/mcp.json` must match `.mcp.json`; after edits run `node scripts/claude-harness/validate-mcp.mjs`.",
      graphLine,
      "",
      "Hooks: https://cursor.com/docs/hooks",
    ].join("\n");

    process.stdout.write(JSON.stringify({ additional_context }));
  })
  .catch((err) => {
    process.stderr.write(`[session-start hook] ${err}\n`);
    process.stdout.write("{}");
  });
