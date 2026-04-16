#!/usr/bin/env node

const fs = require("node:fs");

if (!fs.existsSync("AGENTS.md")) {
  process.exit(0);
}

const hasGraph = fs.existsSync("graphify-out/graph.json");
const graphClause = hasGraph
  ? "Read graphify-out/GRAPH_REPORT.md when architecture context matters."
  : "Build or read the graph only when architecture context matters.";

const additionalContext = [
  "Follow the repo startup order from AGENTS.md and notes/reference before opening raw code.",
  graphClause,
  "After the required note/bootstrap reads, delegate a compact startup brief to `session_briefer` (`gpt-5.4-mini`) before widening into code.",
  "Before your final response on substantive tasks, delegate note cleanup and handoff prep to `notes_curator` (`gpt-5.4-mini`).",
  "Prefer `gpt-5.4-mini` agents for bounded read-heavy sidecar work and `gpt-5.3-codex` agents such as `implementation_worker`, `dashboard_handler`, or `docker_ops` for bounded write execution inside an already-understood surface.",
].join(" ");

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext,
  },
}));
