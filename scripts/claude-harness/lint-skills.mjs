#!/usr/bin/env node
// Lint .agents/skills/*/SKILL.md frontmatter.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const SKILLS_DIR = ".agents/skills";
const errors = [];
const warnings = [];

function parseFrontmatter(text) {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-zA-Z_][\w-]*)\s*[:=]\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[kv[1]] = v;
  }
  return out;
}

if (!existsSync(SKILLS_DIR)) {
  console.error(`✗ ${SKILLS_DIR} not found`);
  process.exit(1);
}

const dirs = readdirSync(SKILLS_DIR).filter((d) => statSync(join(SKILLS_DIR, d)).isDirectory());
console.log(`Linting ${dirs.length} skills in ${SKILLS_DIR}\n`);

for (const dir of dirs) {
  const skillPath = join(SKILLS_DIR, dir, "SKILL.md");
  if (!existsSync(skillPath)) {
    errors.push(`${dir}: missing SKILL.md`);
    console.log(`✗ ${dir}: missing SKILL.md`);
    continue;
  }
  const text = readFileSync(skillPath, "utf8");
  const fm = parseFrontmatter(text);
  if (!fm) {
    errors.push(`${dir}: missing/invalid frontmatter`);
    console.log(`✗ ${dir}: missing/invalid frontmatter`);
    continue;
  }
  const issues = [];
  if (!fm.name) issues.push("missing 'name'");
  else if (fm.name !== dir) issues.push(`name '${fm.name}' != dir '${dir}'`);
  if (!fm.description) issues.push("missing 'description'");
  else if (fm.description.length > 300) issues.push(`description ${fm.description.length} chars (>300)`);
  if (issues.length) {
    issues.forEach((i) => warnings.push(`${dir}: ${i}`));
    console.log(`⚠ ${dir}: ${issues.join("; ")}`);
  } else {
    console.log(`✓ ${dir}`);
  }
}

console.log(`\n${dirs.length} skills | ${errors.length} errors | ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
