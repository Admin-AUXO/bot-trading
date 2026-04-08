const { spawn } = require("node:child_process");
const { loadLocalMcpEnv } = require("./load-local-mcp-env.cjs");

const { repoRoot, env, localEnvPath } = loadLocalMcpEnv();

if (!env.HELIUS_API_KEY) {
  console.error(`Missing HELIUS_API_KEY. Set it in ${localEnvPath}.`);
  process.exit(1);
}

const spawnOptions = {
  cwd: repoRoot,
  stdio: "inherit",
  env,
};

const child =
  process.platform === "win32"
    ? spawn(`npx "helius-mcp@latest"`, { ...spawnOptions, shell: true })
    : spawn("npx", ["helius-mcp@latest"], spawnOptions);

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
