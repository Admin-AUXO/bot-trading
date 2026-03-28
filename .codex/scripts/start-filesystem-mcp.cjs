const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const serverArgs = ["-y", "@modelcontextprotocol/server-filesystem", repoRoot];
const spawnOptions = {
  cwd: repoRoot,
  stdio: "inherit",
  env: process.env,
};
const child =
  process.platform === "win32"
    ? spawn(
        `npx -y @modelcontextprotocol/server-filesystem "${repoRoot.replace(/"/g, '\\"')}"`,
        { ...spawnOptions, shell: true },
      )
    : spawn("npx", serverArgs, spawnOptions);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
