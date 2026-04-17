#!/usr/bin/env node
// Verify each Claude skill has a matching Codex agent (and vice versa).
import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const SKILLS_DIR = ".agents/skills";
const AGENTS_DIR = ".codex/agents";

// Manual mapping: skill (kebab-case dir) ↔ codex agent (snake_case stem).
const PAIRS = {
  "analytics-advice": "analytics_advisor",
  "code-navigation": "code_navigator",
  "code-review-findings": "code_reviewer",
  "dashboard-operations": "dashboard_handler",
  "dashboard-ui-ux": "dashboard_ui_ux_expert",
  "database-safety": "database_agent",
  "docker-ops": "docker_ops",
  "docs-editor": "documentation_editor",
  "graphify": "graph_hygiene",
  "performance-investigation": "performance_engineer",
  "strategy-safety": "strategy_engineer",
  "trading-research-workflow": "trading_research",
  "web-research-workflow": "web_research",
  "session-bookends": "session_briefer",
  "birdeye-discovery-lab": "birdeye_lab",
  "grafana": "grafana_agent",
  "screenshot-analysis": "screenshot_reviewer",
  "obsidian": "obsidian_tender",
};

// Codex agents that intentionally have no skill counterpart.
const CODEX_ONLY = new Set([
  "implementation_worker",
  "notes_curator",
  "repo_contract_auditor",
  "research_scout",
]);

const skills = new Set(
  existsSync(SKILLS_DIR)
    ? readdirSync(SKILLS_DIR).filter((d) => statSync(join(SKILLS_DIR, d)).isDirectory())
    : []
);
const agents = new Set(
  existsSync(AGENTS_DIR) ? readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".toml")).map((f) => f.replace(/\.toml$/, "")) : []
);

const rows = [];
const issues = [];

for (const [skill, agent] of Object.entries(PAIRS)) {
  const sOk = skills.has(skill);
  const aOk = agents.has(agent);
  rows.push({ skill, agent, status: sOk && aOk ? "✓" : "✗" });
  if (!sOk) issues.push(`skill missing: ${skill}`);
  if (!aOk) issues.push(`codex agent missing: ${agent}`);
}

const mappedSkills = new Set(Object.keys(PAIRS));
const mappedAgents = new Set(Object.values(PAIRS));
const orphanSkills = [...skills].filter((s) => !mappedSkills.has(s));
const orphanAgents = [...agents].filter((a) => !mappedAgents.has(a) && !CODEX_ONLY.has(a));

console.log("Skill ↔ Codex Agent Parity\n");
console.log("STATUS  SKILL                              CODEX AGENT");
console.log("------  ---------------------------------  --------------------------");
for (const r of rows) {
  console.log(`  ${r.status}     ${r.skill.padEnd(34)} ${r.agent}`);
}

if (orphanSkills.length) {
  console.log("\nUnmapped skills (no codex agent declared in PAIRS):");
  orphanSkills.forEach((s) => console.log(`  - ${s}`));
  orphanSkills.forEach((s) => issues.push(`unmapped skill: ${s}`));
}
if (orphanAgents.length) {
  console.log("\nUnmapped codex agents (not in PAIRS, not in CODEX_ONLY):");
  orphanAgents.forEach((a) => console.log(`  - ${a}`));
  orphanAgents.forEach((a) => issues.push(`unmapped codex agent: ${a}`));
}

console.log(`\nCodex-only (intentional): ${[...CODEX_ONLY].join(", ")}`);
console.log(`\n${rows.length} mapped pairs | ${issues.length} issues`);
process.exit(issues.length ? 1 : 0);
