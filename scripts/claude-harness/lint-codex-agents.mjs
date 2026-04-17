#!/usr/bin/env node
// Lint .codex/agents/*.toml top-level keys.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const DIR = ".codex/agents";
const REQUIRED = ["name", "description", "model", "sandbox_mode"];
const errors = [];
const warnings = [];

function parseTopLevel(text) {
  const out = {};
  for (const raw of text.split("\n")) {
    if (raw.startsWith("[")) break;
    const m = raw.match(/^([a-zA-Z_][\w]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"""')) {
      out[m[1]] = "<multiline>";
      continue;
    }
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

if (!existsSync(DIR)) {
  console.error(`✗ ${DIR} not found`);
  process.exit(1);
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".toml"));
console.log(`Linting ${files.length} codex agents in ${DIR}\n`);

for (const f of files) {
  const stem = basename(f, ".toml");
  const meta = parseTopLevel(readFileSync(join(DIR, f), "utf8"));
  const issues = [];
  for (const k of REQUIRED) if (!meta[k]) issues.push(`missing '${k}'`);
  if (meta.name && meta.name !== stem) issues.push(`name '${meta.name}' != filename '${stem}'`);
  if (issues.length) {
    issues.forEach((i) => (i.startsWith("missing") ? errors : warnings).push(`${f}: ${i}`));
    console.log(`✗ ${f}: ${issues.join("; ")}`);
  } else {
    console.log(`✓ ${f}`);
  }
}

console.log(`\n${files.length} agents | ${errors.length} errors | ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
