#!/usr/bin/env node
// Validate that MCP server declarations are consistent across .mcp.json,
// .claude/settings.json, and .codex/config.toml.
import { readFileSync, existsSync } from "node:fs";

const KNOWN = [
  "browsermcp",
  "desktop_commander", "birdeye-mcp", "helius", "firecrawl", "context7",
  "github", "grafana", "postgres", "chrome_devtools", "fetch", "time", "shadcn",
];

function readJson(p) {
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

function tomlMcpServers(p) {
  if (!existsSync(p)) return [];
  const text = readFileSync(p, "utf8");
  const out = new Set();
  for (const m of text.matchAll(/\[mcp_servers\.([\w-]+)(?:\.[\w-]+)?\]/g)) {
    out.add(m[1]);
  }
  return [...out];
}

function refsInDoc(p) {
  if (!existsSync(p)) return [];
  const text = readFileSync(p, "utf8");
  return KNOWN.filter((s) => new RegExp(`\\b${s.replace(/-/g, "\\-")}\\b`).test(text));
}

const mcp = readJson(".mcp.json");
const claudeSettings = readJson(".claude/settings.json");
const codexServers = tomlMcpServers(".codex/config.toml");

const mcpServers = mcp ? Object.keys(mcp.mcpServers || {}) : [];
const claudeAllowed = (claudeSettings && claudeSettings.enabledMcpjsonServers) || [];

console.log(".mcp.json declarations:    ", mcpServers.join(", ") || "(none)");
console.log(".codex/config.toml:        ", codexServers.join(", ") || "(none)");
console.log(".claude enabledMcpjsonServers:", claudeAllowed.join(", ") || "(none)");

const issues = [];

// Every .claude allowlist entry must exist in .mcp.json.
for (const s of claudeAllowed) {
  if (!mcpServers.includes(s)) issues.push(`enabledMcpjsonServers references '${s}' missing from .mcp.json`);
}

// Servers referenced in CLAUDE.md / AGENTS.md but undeclared anywhere.
const docRefs = new Set([...refsInDoc("CLAUDE.md"), ...refsInDoc("AGENTS.md"), ...refsInDoc(".claude/CLAUDE.md")]);
const declared = new Set([...mcpServers, ...codexServers]);
for (const r of docRefs) {
  if (!declared.has(r)) issues.push(`docs reference '${r}' but no MCP declaration found`);
}

// Exact parity keeps Claude and Codex from drifting into different MCP surfaces.
const mcpSet = new Set(mcpServers);
const driftOnlyCodex = codexServers.filter((s) => !mcpSet.has(s));
const driftOnlyMcpJson = mcpServers.filter((s) => !codexServers.includes(s));
if (driftOnlyCodex.length) {
  issues.push(`.codex/config.toml declares MCPs missing from .mcp.json: ${driftOnlyCodex.join(", ")}`);
}
if (driftOnlyMcpJson.length) {
  issues.push(`.mcp.json declares MCPs missing from .codex/config.toml: ${driftOnlyMcpJson.join(", ")}`);
}

if (issues.length) {
  console.log("\n✗ Issues:");
  issues.forEach((i) => console.log(`  - ${i}`));
  process.exit(1);
}
console.log("\n✓ MCP declarations consistent");
