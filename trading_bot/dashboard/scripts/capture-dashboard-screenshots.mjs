import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium, devices } from "playwright";
import { buildDashboardScreenshotManifest } from "./dashboard-screenshot-manifest.mjs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.split("=");
    return [key, value];
  }),
);

const dashboardUrl = args.get("--base-url") ?? process.env.DASHBOARD_URL ?? "http://127.0.0.1:3100";
const apiUrl = args.get("--api-url") ?? process.env.API_URL ?? "http://127.0.0.1:3101";
const deviceName = args.get("--device") ?? process.env.SCREENSHOT_DEVICE ?? "Desktop Chrome";
const outputDir = path.resolve(
  args.get("--output-dir")
    ?? process.env.SCREENSHOT_OUTPUT_DIR
    ?? path.join("artifacts", "dashboard-screenshots", timestampSlug(new Date())),
);

const device = devices[deviceName];
if (!device) {
  throw new Error(`Unknown Playwright device: ${deviceName}`);
}

try {
  await chromium.launch({ headless: true }).then((browser) => browser.close());
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  throw new Error(
    "Playwright could not launch Chromium. Ensure the browser is installed with 'npx playwright install chromium' and run the capture outside restrictive sandboxes if browser launch permissions are blocked. "
    + detail,
  );
}

await fs.mkdir(outputDir, { recursive: true });

const manifest = await buildDashboardScreenshotManifest({ apiUrl });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...device,
  colorScheme: "dark",
});
const page = await context.newPage();

const results = [];

for (const route of manifest.routes) {
  const targetUrl = new URL(route.path, dashboardUrl).toString();
  const filePath = path.join(outputDir, `${route.name}.png`);
  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1_200);
    await page.screenshot({ path: filePath, fullPage: true });
    results.push({ ...route, url: targetUrl, filePath, ok: true });
    process.stdout.write(`captured ${route.name} -> ${filePath}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ ...route, url: targetUrl, filePath, ok: false, error: message });
    process.stdout.write(`failed ${route.name} -> ${message}\n`);
  }
}

await browser.close();

const reportPath = path.join(outputDir, "manifest.json");
await fs.writeFile(
  reportPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      dashboardUrl,
      apiUrl,
      deviceName,
      routes: results,
    },
    null,
    2,
  ),
);

process.stdout.write(`wrote ${reportPath}\n`);

function timestampSlug(value) {
  return value.toISOString().replaceAll(":", "-");
}
