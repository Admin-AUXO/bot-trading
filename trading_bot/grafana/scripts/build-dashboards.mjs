import path from "node:path";
import { fileURLToPath } from "node:url";

import { writeDashboards } from "../src/dashboard-generator/index.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dashboardsDir = path.resolve(scriptDir, "..", "dashboards");

const count = await writeDashboards(dashboardsDir);

console.log(`Wrote ${count} Grafana dashboards to ${dashboardsDir}`);
