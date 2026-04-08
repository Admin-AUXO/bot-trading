const { spawn } = require("node:child_process");
const { loadLocalMcpEnv } = require("./load-local-mcp-env.cjs");

const { repoRoot, env, localEnvPath } = loadLocalMcpEnv();

if (!env.BIRDEYE_API_KEY) {
  console.error(`Missing BIRDEYE_API_KEY. Set it in ${localEnvPath}.`);
  process.exit(1);
}

const serverArgs = [
  "-y",
  "mcp-remote",
  "https://mcp.birdeye.so/mcp",
  "--header",
  `x-api-key:${env.BIRDEYE_API_KEY}`,
];

const spawnOptions = {
  cwd: repoRoot,
  stdio: "inherit",
  env,
};

const child =
  process.platform === "win32"
    ? spawn(
        `npx ${serverArgs.map((arg) => `"${String(arg).replace(/"/g, '\\"')}"`).join(" ")}`,
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
