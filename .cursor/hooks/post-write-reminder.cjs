#!/usr/bin/env node
/**
 * Cursor postToolUse hook — after successful file writes, nudge doc parity.
 * Matcher in hooks.json limits to Write | StrReplace | MultiEdit.
 * @see https://cursor.com/docs/hooks (postToolUse → additional_context)
 */
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
    let input;
    try {
      input = JSON.parse(raw || "{}");
    } catch {
      process.stdout.write("{}");
      return;
    }

    const tool = String(input.tool_name || "");
    if (!/write|strreplace|multiedit/i.test(tool)) {
      process.stdout.write("{}");
      return;
    }

    const additional_context =
      "Post-write: if you changed runtime contracts, HTTP routes, Prisma schema or SQL views, strategy behavior, or operator UX, update the owning `notes/reference/*.md` or active `notes/sessions/*.md` note in the same pass. MCP server renames → `node scripts/claude-harness/validate-mcp.mjs`. Skill behavior changes → `node scripts/claude-harness/lint-skills.mjs`.";

    process.stdout.write(JSON.stringify({ additional_context }));
  })
  .catch((err) => {
    process.stderr.write(`[post-write-reminder hook] ${err}\n`);
    process.stdout.write("{}");
  });
