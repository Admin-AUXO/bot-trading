#!/usr/bin/env node

const fs = require("node:fs");

if (!fs.existsSync("AGENTS.md")) {
  process.exit(0);
}

const hasGraph = fs.existsSync("graphify-out/graph.json");

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: [
      "Follow AGENTS.md for session startup order.",
      hasGraph ? "graphify-out/GRAPH_REPORT.md is available for architecture context." : "Graphify not yet built; skip unless architecture context is needed.",
    ].join(" "),
  },
}));
