import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

type CliArgs = Record<string, string | boolean>;

type Scenario = {
  name: string;
  description: string;
  thresholds: Record<string, string>;
};

type LabReport = {
  querySummaries?: Array<{
    returnedCount?: number;
    selectedCount?: number;
    goodCount?: number;
    recipeName?: string;
  }>;
  deepEvaluations?: Array<{
    mint?: string;
    symbol?: string;
    recipeName?: string;
    pass?: boolean;
    playScore?: number;
    rejectReason?: string | null;
    marketCapUsd?: number | null;
    volume1mUsd?: number | null;
    trades1m?: number | null;
    timeSinceGraduationMin?: number | null;
    timeSinceCreationMin?: number | null;
  }>;
};

type UnionMint = {
  mint: string;
  symbol: string;
  passes: number;
  appearances: number;
  bestPlayScore: number;
  marketCapUsd: number | null;
  volume1mUsd: number | null;
  trades1m: number | null;
  timeSinceGraduationMin: number | null;
  timeSinceCreationMin: number | null;
  scenarios: Set<string>;
  recipes: Set<string>;
  rejectReasons: Map<string, number>;
};

const BUILTIN_SCENARIOS: Scenario[] = [
  {
    name: "loose",
    description: "Broad research lens for raw-union early token recall.",
    thresholds: {
      "min-liquidity-usd": "8000",
      "max-market-cap-usd": "2000000",
      "min-holders": "25",
      "min-volume-5m-usd": "1200",
      "min-unique-buyers-5m": "10",
      "min-buy-sell-ratio": "1.02",
      "max-top10-holder-percent": "45",
      "max-single-holder-percent": "24",
      "max-negative-price-change-5m-percent": "18",
    },
  },
  {
    name: "balanced",
    description: "Middle lane for early-token quality without fully starving recall.",
    thresholds: {
      "min-liquidity-usd": "10000",
      "max-market-cap-usd": "1200000",
      "min-holders": "35",
      "min-volume-5m-usd": "1800",
      "min-unique-buyers-5m": "12",
      "min-buy-sell-ratio": "1.05",
      "max-top10-holder-percent": "42",
      "max-single-holder-percent": "22",
      "max-negative-price-change-5m-percent": "12",
    },
  },
  {
    name: "strict",
    description: "Tighter scalp-quality lane for live-leaning early token screening.",
    thresholds: {
      "min-liquidity-usd": "12000",
      "max-market-cap-usd": "850000",
      "min-holders": "45",
      "min-volume-5m-usd": "2500",
      "min-unique-buyers-5m": "15",
      "min-buy-sell-ratio": "1.10",
      "max-top10-holder-percent": "38",
      "max-single-holder-percent": "18",
      "max-negative-price-change-5m-percent": "8",
    },
  },
];

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
  if (typeof value !== "string" || value.trim().length === 0) return fallback;
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
        return;
      }
      reject(new Error(`command failed with code ${code}`));
    });
  });
}

function topRejects(report: LabReport) {
  const counts = new Map<string, number>();
  for (const row of report.deepEvaluations ?? []) {
    if (row.pass === true) continue;
    const reason = (row.rejectReason ?? "unknown").trim() || "unknown";
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([reason, count]) => ({ reason, count }));
}

function asFiniteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.recipes !== "string" || args.recipes.trim().length === 0) {
    throw new Error("--recipes is required");
  }

  const recipesPath = path.resolve(process.cwd(), args.recipes);
  const scenarioNames = new Set(csv(args.scenarios, BUILTIN_SCENARIOS.map((scenario) => scenario.name)));
  const scenarios = BUILTIN_SCENARIOS.filter((scenario) => scenarioNames.has(scenario.name));
  if (scenarios.length === 0) {
    throw new Error("No scenarios selected.");
  }

  const sources = csv(args.sources, ["pump_dot_fun"]);
  const outDir = path.resolve(
    typeof args["out-dir"] === "string"
      ? args["out-dir"]
      : "../../artifacts/discovery-lab-scenario-bench",
  );
  const profile = typeof args.profile === "string" ? args.profile : "scalp";
  const deepEvalLimit = typeof args["deep-eval-limit"] === "string" ? args["deep-eval-limit"] : "100";
  const queryConcurrency = typeof args["query-concurrency"] === "string" ? args["query-concurrency"] : "2";
  const deepConcurrency = typeof args["deep-concurrency"] === "string" ? args["deep-concurrency"] : "3";
  const cacheTtlSeconds = typeof args["cache-ttl-seconds"] === "string" ? args["cache-ttl-seconds"] : "0";
  const includePreGate = args["include-pre-gate"] === true;

  await fs.mkdir(outDir, { recursive: true });

  const unionByMint = new Map<string, UnionMint>();
  const scenarioSummaries: Array<Record<string, unknown>> = [];

  for (const scenario of scenarios) {
    const outPath = path.join(outDir, `${scenario.name}.json`);
    const commandArgs = [
      "run",
      "lab:discovery",
      "--",
      "--recipes",
      recipesPath,
      "--sources",
      sources.join(","),
      "--profile",
      profile,
      "--deep-eval-limit",
      deepEvalLimit,
      "--query-concurrency",
      queryConcurrency,
      "--deep-concurrency",
      deepConcurrency,
      "--cache-ttl-seconds",
      cacheTtlSeconds,
      "--out",
      outPath,
    ];

    if (includePreGate) {
      commandArgs.push("--include-pre-gate");
    }

    for (const [key, value] of Object.entries(scenario.thresholds)) {
      commandArgs.push(`--${key}`, value);
    }

    console.log(`\n[scenario] ${scenario.name}: ${scenario.description}`);
    await runCommand(commandArgs);

    const report = JSON.parse(await fs.readFile(outPath, "utf8")) as LabReport;
    const querySummaries = report.querySummaries ?? [];
    const deepEvaluations = report.deepEvaluations ?? [];
    const uniqueMints = new Set(
      deepEvaluations
        .map((row) => row.mint)
        .filter((mint): mint is string => typeof mint === "string" && mint.length > 0),
    );
    const passedCount = deepEvaluations.filter((row) => row.pass === true).length;

    for (const row of deepEvaluations) {
      if (!row.mint) continue;
      const current = unionByMint.get(row.mint) ?? {
        mint: row.mint,
        symbol: row.symbol ?? "unknown",
        passes: 0,
        appearances: 0,
        bestPlayScore: Number.NEGATIVE_INFINITY,
        marketCapUsd: asFiniteNumber(row.marketCapUsd),
        volume1mUsd: asFiniteNumber(row.volume1mUsd),
        trades1m: asFiniteNumber(row.trades1m),
        timeSinceGraduationMin: asFiniteNumber(row.timeSinceGraduationMin),
        timeSinceCreationMin: asFiniteNumber(row.timeSinceCreationMin),
        scenarios: new Set<string>(),
        recipes: new Set<string>(),
        rejectReasons: new Map<string, number>(),
      };
      current.appearances += 1;
      current.passes += row.pass === true ? 1 : 0;
      current.bestPlayScore = Math.max(current.bestPlayScore, Number(row.playScore ?? 0));
      current.scenarios.add(scenario.name);
      if (row.recipeName) {
        current.recipes.add(row.recipeName);
      }
      if (row.pass !== true) {
        const reason = (row.rejectReason ?? "unknown").trim() || "unknown";
        current.rejectReasons.set(reason, (current.rejectReasons.get(reason) ?? 0) + 1);
      }
      if (current.marketCapUsd === null) current.marketCapUsd = asFiniteNumber(row.marketCapUsd);
      if (current.volume1mUsd === null) current.volume1mUsd = asFiniteNumber(row.volume1mUsd);
      if (current.trades1m === null) current.trades1m = asFiniteNumber(row.trades1m);
      if (current.timeSinceGraduationMin === null) current.timeSinceGraduationMin = asFiniteNumber(row.timeSinceGraduationMin);
      if (current.timeSinceCreationMin === null) current.timeSinceCreationMin = asFiniteNumber(row.timeSinceCreationMin);
      unionByMint.set(row.mint, current);
    }

    scenarioSummaries.push({
      name: scenario.name,
      description: scenario.description,
      outPath,
      returnedCount: querySummaries.reduce((sum, row) => sum + Number(row.returnedCount ?? 0), 0),
      selectedCount: querySummaries.reduce((sum, row) => sum + Number(row.selectedCount ?? 0), 0),
      goodCount: querySummaries.reduce((sum, row) => sum + Number(row.goodCount ?? 0), 0),
      evaluatedCount: deepEvaluations.length,
      passedCount,
      uniqueMintCount: uniqueMints.size,
      topRejects: topRejects(report),
    });
  }

  const unionSummary = [...unionByMint.values()]
    .sort((left, right) => right.bestPlayScore - left.bestPlayScore)
    .map((row) => ({
      mint: row.mint,
      symbol: row.symbol,
      appearances: row.appearances,
      passes: row.passes,
      bestPlayScore: Number(row.bestPlayScore.toFixed(6)),
      marketCapUsd: row.marketCapUsd,
      volume1mUsd: row.volume1mUsd,
      trades1m: row.trades1m,
      timeSinceGraduationMin: row.timeSinceGraduationMin,
      timeSinceCreationMin: row.timeSinceCreationMin,
      scenarios: [...row.scenarios].sort(),
      recipes: [...row.recipes].sort(),
      topRejects: [...row.rejectReasons.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 4)
        .map(([reason, count]) => ({ reason, count })),
    }));

  const summaryPath = path.join(outDir, "summary.json");
  await fs.writeFile(
    summaryPath,
    JSON.stringify({
      recipesPath,
      profile,
      includePreGate,
      scenarioSummaries,
      unionSummary,
    }, null, 2),
  );

  console.log("\n[scenario] Summary");
  for (const scenario of scenarioSummaries) {
    console.log(
      `- ${scenario.name}: returned=${scenario.returnedCount}, evaluated=${scenario.evaluatedCount}, passed=${scenario.passedCount}, uniqueMints=${scenario.uniqueMintCount}`,
    );
  }
  console.log(`- union: uniqueMints=${unionSummary.length}, summary=${summaryPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
