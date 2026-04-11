import fs from "node:fs/promises";
import path from "node:path";

import { analystDashboard, candidateDashboard, configDashboard, positionDashboard, sourceDashboard } from "./analytics.mjs";
import { dashboardMeta } from "./core.mjs";
import { liveDashboard, telemetryDashboard } from "./operations.mjs";
import { researchDashboard } from "./research.mjs";
import { executiveDashboard } from "./scorecards.mjs";

export const dashboards = [
  executiveDashboard(),
  analystDashboard(),
  liveDashboard(),
  telemetryDashboard(),
  candidateDashboard(),
  positionDashboard(),
  configDashboard(),
  sourceDashboard(),
  researchDashboard(),
];

export async function writeDashboards(dashboardsDir) {
  for (const dashboard of dashboards) {
    const meta = Object.values(dashboardMeta).find((entry) => entry.uid === dashboard.uid);
    if (!meta) {
      throw new Error(`missing folder for dashboard ${dashboard.uid}`);
    }

    const filePath = path.join(dashboardsDir, meta.folder, `${dashboard.uid}.json`);
    await fs.writeFile(filePath, `${JSON.stringify(dashboard, null, 2)}\n`, "utf8");
  }

  return dashboards.length;
}
