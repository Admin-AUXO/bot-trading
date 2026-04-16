import { runDiscoveryLabCli } from "./discovery-lab/runner.js";

runDiscoveryLabCli().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
