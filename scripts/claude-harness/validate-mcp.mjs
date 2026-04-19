#!/usr/bin/env node
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
const cursorMcp = readJson(".cursor/mcp.json");
const claudeSettings = readJson(".claude/settings.json");
const codexServers = tomlMcpServers(".codex/config.toml");

const mcpServers = mcp ? Object.keys(mcp.mcpServers || {}) : [];
const cursorServers = cursorMcp ? Object.keys(cursorMcp.mcpServers || {}) : [];
const claudeAllowed = (claudeSettings && claudeSettings.enabledMcpjsonServers) || [];

console.log(".mcp.json declarations:    ", mcpServers.join(", ") || "(none)");
console.log(".cursor/mcp.json:          ", cursorServers.join(", ") || "(missing)");
console.log(".codex/config.toml:        ", codexServers.join(", ") || "(none)");
console.log(".claude enabledMcpjsonServers:", claudeAllowed.join(", ") || "(none)");

const issues = [];

for (const s of claudeAllowed) {
  if (!mcpServers.includes(s)) issues.push(`enabledMcpjsonServers references '${s}' missing from .mcp.json`);
}

const docRefs = new Set([...refsInDoc("CLAUDE.md"), ...refsInDoc("AGENTS.md"), ...refsInDoc(".claude/CLAUDE.md")]);
const declared = new Set([...mcpServers, ...codexServers]);
for (const r of docRefs) {
  if (!declared.has(r)) issues.push(`docs reference '${r}' but no MCP declaration found`);
}

const mcpSet = new Set(mcpServers);
const driftOnlyCodex = codexServers.filter((s) => !mcpSet.has(s));
const driftOnlyMcpJson = mcpServers.filter((s) => !codexServers.includes(s));
if (driftOnlyCodex.length) {
  issues.push(`.codex/config.toml declares MCPs missing from .mcp.json: ${driftOnlyCodex.join(", ")}`);
}
if (driftOnlyMcpJson.length) {
  issues.push(`.mcp.json declares MCPs missing from .codex/config.toml: ${driftOnlyMcpJson.join(", ")}`);
}

if (!cursorMcp) {
  issues.push(".cursor/mcp.json missing (Cursor project MCP)");
} else {
  const onlyMcp = mcpServers.filter((s) => !cursorServers.includes(s));
  const onlyCursor = cursorServers.filter((s) => !mcpServers.includes(s));
  if (onlyMcp.length) {
    issues.push(`.mcp.json has servers missing from .cursor/mcp.json: ${onlyMcp.join(", ")}`);
  }
  if (onlyCursor.length) {
    issues.push(`.cursor/mcp.json has servers missing from .mcp.json: ${onlyCursor.join(", ")}`);
  }
}

if (issues.length) {
  console.log("\n✗ Issues:");
  issues.forEach((i) => console.log(`  - ${i}`));
  process.exit(1);
}
console.log("\n✓ MCP declarations consistent");
