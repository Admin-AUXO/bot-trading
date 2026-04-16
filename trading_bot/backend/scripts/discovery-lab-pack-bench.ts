import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_PACKS = [
  "created-early-grad-scalp-tape-surge",
  "created-early-grad-scalp-buyer-stack",
  "created-early-grad-scalp-liquidity-ramp",
  "created-early-grad-scalp-momentum-retest",
  "created-early-grad-scalp-quality-guard",
];

type CliArgs = Record<string, string | boolean>;

function parseArgs(argv: string[]): CliArgs {
  const parsed: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;

    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function csv(value: string | boolean | undefined, fallback: string[]) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

async function runCommand(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("npm", args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`command failed with code ${code}`));
      }
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const packs = csv(args.packs, DEFAULT_PACKS);
  const sources = csv(args.sources, ["pump_dot_fun"]);
  const cacheTtlSeconds = typeof args["cache-ttl-seconds"] === "string" ? args["cache-ttl-seconds"] : "0";
  const queryConcurrency = typeof args["query-concurrency"] === "string" ? args["query-concurrency"] : "2";
  const deepConcurrency = typeof args["deep-concurrency"] === "string" ? args["deep-concurrency"] : "3";
  const outDir = path.resolve(
    typeof args["out-dir"] === "string"
      ? args["out-dir"]
      : "../../.codex/tmp/discovery-lab-pack-bench",
  );

  await fs.mkdir(outDir, { recursive: true });
  const summary: Array<{
    packId: string;
    winners: number;
    evaluations: number;
    avgWinnerScore: number;
    topRejectReason: string;
  }> = [];

  for (const packId of packs) {
    const outPath = path.join(outDir, `${packId}.json`);
    console.log(`\n[bench] Running ${packId}`);
    await runCommand([
      "run",
      "lab:discovery",
      "--",
      "--pack",
      packId,
      "--sources",
      sources.join(","),
      "--cache-ttl-seconds",
      cacheTtlSeconds,
      "--query-concurrency",
      queryConcurrency,
      "--deep-concurrency",
      deepConcurrency,
      "--out",
      outPath,
    ]);

    const report = JSON.parse(await fs.readFile(outPath, "utf8")) as {
      deepEvaluations?: Array<{ pass?: boolean; playScore?: number; rejectReason?: string | null }>;
    };

    const evaluations = report.deepEvaluations ?? [];
    const winners = evaluations.filter((item) => item.pass === true);
    const avgWinnerScore = winners.length > 0
      ? winners.reduce((sum, item) => sum + Number(item.playScore ?? 0), 0) / winners.length
      : 0;

    const rejectCounts = new Map<string, number>();
    for (const item of evaluations) {
      if (item.pass === true) continue;
      const reason = (item.rejectReason ?? "unknown").trim();
      rejectCounts.set(reason, (rejectCounts.get(reason) ?? 0) + 1);
    }
    const topRejectReason = [...rejectCounts.entries()]
      .sort((left, right) => right[1] - left[1])[0]?.[0] ?? "n/a";

    summary.push({
      packId,
      winners: winners.length,
      evaluations: evaluations.length,
      avgWinnerScore,
      topRejectReason,
    });
  }

  console.log("\n[bench] Summary");
  for (const item of summary) {
    console.log(
      `- ${item.packId}: winners=${item.winners}/${item.evaluations}, avgWinnerScore=${item.avgWinnerScore.toFixed(3)}, topReject=${item.topRejectReason}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
