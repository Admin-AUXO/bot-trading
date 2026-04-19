#!/usr/bin/env node
/**
 * Graph QuickRef Generator
 * Regenerates GRAPH_QUICKREF.md with latest graph stats
 * Run after: node ./.codex/scripts/graphify.mjs build-local .
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const graphDir = path.join(__dirname, "..", "..", "graphify-out");
const schemaPath = path.join(graphDir, "GRAPH_SCHEMA.json");

const data = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

const nodes = data.nodes || [];
const edges = data.edges || [];
const communities = data.communities || [];

const nodeMap = {};
nodes.forEach((n) => (nodeMap[n.id] = n));

function getCategory(file) {
  if (!file) return "unknown";
  if (file.includes("dashboard") && !file.includes("grafana")) return "dashboard";
  if (file.includes("grafana")) return "grafana";
  if (file.includes("prisma") || file.includes("/db/")) return "database";
  if (file.includes("scripts/")) return "scripts";
  if (file.includes("backend/src")) return "backend";
  return "backend";
}

nodes.forEach((n) => {
  n.category = getCategory(n.file);
});

const mainCats = ["dashboard", "backend", "grafana", "database"];
const crossEdges = edges.filter((e) => {
  const src = nodeMap[e.src];
  const tgt = nodeMap[e.tgt];
  if (!src || !tgt) return false;
  return (
    mainCats.includes(src.category) &&
    mainCats.includes(tgt.category) &&
    src.category !== tgt.category
  );
});

const pairMap = {};
crossEdges.forEach((e) => {
  const src = nodeMap[e.src];
  const tgt = nodeMap[e.tgt];
  const pair = [src.category, tgt.category].sort().join("↔");
  pairMap[pair] = (pairMap[pair] || 0) + 1;
});

const topBridges = nodes
  .filter((n) => n.centrality > 0.01)
  .sort((a, b) => b.centrality - a.centrality)
  .slice(0, 5);

const wellDefined = communities
  .filter((c) => c.cohesion > 0.15 && (typeof c.nodes === 'number' ? c.nodes : (c.nodes?.length || 0)) > 10)
  .sort((a, b) => b.cohesion - a.cohesion)
  .slice(0, 6);

const quickref = `# Graph Quick Ref

Ultra-compact reference. For details see other files in this directory.

## Stats
- ${data.corpus?.files || "?"} files · ${nodes.length} nodes · ${edges.length} edges · ${communities.length} communities
- EXTRACTED: ${data.stats?.extracted || "?"} · INFERRED: ${data.stats?.inferred || "?"}

## Top 5 Bridge Nodes
| Node | Cent | Purpose |
|------|------|---------|
${topBridges
  .map(
    (n) =>
      `| \`${n.label}\` | ${n.centrality.toFixed(3)} | ${n.file?.split("/").pop() || "—"} |`
  )
  .join("\n")}

## Cross-Boundary Edges
| Pair | Count |
|------|-------|
${Object.entries(pairMap)
  .map(([k, v]) => `| ${k} | ${v} |`)
  .join("\n")}

## Well-Defined Communities (cohesion > 0.15)
| Cohesion | Label | Nodes |
|----------|-------|-------|
${wellDefined
  .map((c) => `| ${c.cohesion.toFixed(2)} | ${c.label} | ${c.nodes} |`)
  .join("\n")}

## Entry Points
| Concern | Key Functions |
|---------|---------------|
| Graduation | .evaluateCandidate(), .evaluateDueCandidates() |
| Execution | .openPosition(), .openLivePosition() |
| Exit | .run(), getExitDecision() |
| Discovery | discovery-lab-service.ts orchestrator |

## External Clients
| Client | Purpose |
|--------|---------|
| SolsnifferClient | Holder analytics |
| PumpfunPublicClient | Meme coin data |
| BirdeyeClient | Price/liquidity |
| HeliusClient | RPC + API |
| DexScreenerClient | Pairs discovery |

## Skill Load Guide
| Working On | Load Skill |
|-----------|-----------|
| Graduation thresholds | adaptive-thresholds |
| Token discovery | birdeye-discovery-lab |
| Dashboard routes | dashboard-operations |
| Grafana panels | grafana |
| SmartWallet/webhooks | smart-money-watcher |
| Strategy packs | strategy-pack-authoring |
| New enrichment client | token-enrichment |
| DB schema changes | database-safety |
| Entry/exit logic | strategy-safety |

## Files in This Directory
| File | Purpose |
|------|---------|
| GRAPH_MAPS.md | Cross-boundary maps |
| GRAPH_CLIENTS.md | External API client directory |
| GRAPH_ACTIONS.md | State mutation catalog |
| GRAPH_WORKFLOWS.md | Data flow diagrams |
| GRAPH_SKILLS.md | Skill selector guide |
| GRAPH_REPORT_COMPACT.md | Full compact report |
| GRAPH_SCHEMA.json | Machine-readable graph |

---

_Generated: ${new Date().toISOString().split("T")[0]}_
`;

const outputPath = path.join(graphDir, "GRAPH_QUICKREF.md");
fs.writeFileSync(outputPath, quickref, "utf8");
console.log(`Generated ${outputPath}`);
