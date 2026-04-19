import { promises as fs } from "node:fs";
import path from "node:path";

type DeepEvaluationRow = {
  planKey?: string;
  recipeName?: string;
  mode?: "graduated" | "pregrad";
  mint?: string;
  symbol?: string;
  pass?: boolean;
  rejectReason?: string | null;
  marketCapUsd?: number | null;
  volume1mUsd?: number | null;
  volume5mUsd?: number | null;
  trades1m?: number | null;
  trades5m?: number | null;
  priceChange1mPercent?: number | null;
  priceChange5mPercent?: number | null;
  buySellRatio?: number | null;
  top10HolderPercent?: number | null;
  largestHolderPercent?: number | null;
  timeSinceGraduationMin?: number | null;
};

type QuerySummaryRow = {
  recipeName?: string;
  returnedCount?: number;
  selectedCount?: number;
  goodCount?: number;
  filterCount?: number;
};

type LabReport = {
  queryCount?: number;
  querySummaries?: QuerySummaryRow[];
  deepEvaluations?: DeepEvaluationRow[];
};

type BucketDef = {
  label: string;
  matches: (value: number) => boolean;
};

function parseArgs(argv: string[]) {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function bucketCounts(rows: DeepEvaluationRow[], pick: (row: DeepEvaluationRow) => number | null | undefined, buckets: BucketDef[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = pick(row);
    if (!isFiniteNumber(value)) {
      counts.set("unknown", (counts.get("unknown") ?? 0) + 1);
      continue;
    }
    const bucket = buckets.find((candidate) => candidate.matches(value))?.label ?? "other";
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts.entries()].sort((left, right) => right[1] - left[1]),
  );
}

function topRejects(rows: DeepEvaluationRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.pass === true) continue;
    const key = (row.rejectReason ?? "no_reject_reason").trim() || "no_reject_reason";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([reason, count]) => ({ reason, count }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = args.dir ? path.resolve(process.cwd(), args.dir) : null;
  if (!dir) {
    throw new Error("--dir is required");
  }

  const files = (await fs.readdir(dir))
    .filter((entry) => entry.endsWith(".json"))
    .sort();

  const marketCapBuckets: BucketDef[] = [
    { label: "<100k", matches: (value) => value < 100_000 },
    { label: "100-250k", matches: (value) => value >= 100_000 && value < 250_000 },
    { label: "250-500k", matches: (value) => value >= 250_000 && value < 500_000 },
    { label: "500k-1m", matches: (value) => value >= 500_000 && value < 1_000_000 },
    { label: ">=1m", matches: (value) => value >= 1_000_000 },
  ];
  const volume1mBuckets: BucketDef[] = [
    { label: "<1k", matches: (value) => value < 1_000 },
    { label: "1-5k", matches: (value) => value >= 1_000 && value < 5_000 },
    { label: "5-10k", matches: (value) => value >= 5_000 && value < 10_000 },
    { label: "10-25k", matches: (value) => value >= 10_000 && value < 25_000 },
    { label: ">=25k", matches: (value) => value >= 25_000 },
  ];
  const trades1mBuckets: BucketDef[] = [
    { label: "<10", matches: (value) => value < 10 },
    { label: "10-24", matches: (value) => value >= 10 && value < 25 },
    { label: "25-49", matches: (value) => value >= 25 && value < 50 },
    { label: "50-99", matches: (value) => value >= 50 && value < 100 },
    { label: ">=100", matches: (value) => value >= 100 },
  ];
  const pnlBuckets: BucketDef[] = [
    { label: "<-10%", matches: (value) => value < -10 },
    { label: "-10 to -5", matches: (value) => value >= -10 && value < -5 },
    { label: "-5 to 0", matches: (value) => value >= -5 && value < 0 },
    { label: "0 to 10", matches: (value) => value >= 0 && value < 10 },
    { label: "10 to 25", matches: (value) => value >= 10 && value < 25 },
    { label: ">=25", matches: (value) => value >= 25 },
  ];

  const output: Array<Record<string, unknown>> = [];

  for (const file of files) {
    const report = JSON.parse(await fs.readFile(path.join(dir, file), "utf8")) as LabReport;
    const evals = report.deepEvaluations ?? [];
    const passed = evals.filter((row) => row.pass === true);
    output.push({
      file,
      queryCount: report.queryCount ?? 0,
      returnedCount: (report.querySummaries ?? []).reduce((sum, row) => sum + (row.returnedCount ?? 0), 0),
      evaluatedCount: evals.length,
      passedCount: passed.length,
      passRate: evals.length > 0 ? Number((passed.length / evals.length).toFixed(4)) : 0,
      topRejects: topRejects(evals),
      marketCapBands: bucketCounts(evals, (row) => row.marketCapUsd, marketCapBuckets),
      volume1mBands: bucketCounts(evals, (row) => row.volume1mUsd, volume1mBuckets),
      trades1mBands: bucketCounts(evals, (row) => row.trades1m, trades1mBuckets),
      priceChange1mBands: bucketCounts(evals, (row) => row.priceChange1mPercent, pnlBuckets),
      priceChange5mBands: bucketCounts(evals, (row) => row.priceChange5mPercent, pnlBuckets),
      recipeSummaries: (report.querySummaries ?? []).map((row) => ({
        recipeName: row.recipeName ?? "unknown",
        returnedCount: row.returnedCount ?? 0,
        selectedCount: row.selectedCount ?? 0,
        goodCount: row.goodCount ?? 0,
        filterCount: row.filterCount ?? 0,
      })),
    });
  }

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
