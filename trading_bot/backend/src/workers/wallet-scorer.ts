import { parentPort, workerData } from "node:worker_threads";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("wallet-scorer");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env["DATABASE_URL"], max: 2, idleTimeoutMillis: 10_000 }),
});
const workerId: number = workerData?.workerId ?? 0;

interface ScoringConfig {
  txFetchLimit: number;
  minTxCount: number;
  consistencyMultiplier: number;
  placeholderAgeDays: number;
  weights: { winRate: number; maxLoss: number; consistency: number; frequency: number; diversity: number; age: number };
  freqMin: number;
  freqMax: number;
  diversityMin: number;
  ageMinDays: number;
  archetypeSniper: { minWinRate: number; minFreq: number };
  archetypeSwingMaxFreq: number;
}

if (!workerData?.scoringConfig) throw new Error("wallet-scorer worker requires scoringConfig in workerData");
const sc = workerData.scoringConfig as ScoringConfig;

interface ScoringTask {
  walletAddress: string;
  heliusApiKey: string;
  heliusRpcUrl: string;
}

interface ScoringResult {
  walletAddress: string;
  compositeScore: number;
  archetype: string;
  winRate: number;
  maxLoss: number;
  consistency: number;
  frequency: number;
  diversity: number;
  age: number;
}

async function getTransactionsForWallet(address: string, apiKey: string): Promise<unknown[]> {
  try {
    const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?limit=${sc.txFetchLimit}`;
    const res = await fetch(url, {
      headers: { "Authorization": `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    return (await res.json()) as unknown[];
  } catch {
    return [];
  }
}

function computeScore(txs: unknown[]): ScoringResult | null {
  if (txs.length < sc.minTxCount) return null;

  let wins = 0;
  let losses = 0;
  let maxLoss = 0;
  const tokens = new Set<string>();

  for (const tx of txs as Array<Record<string, unknown>>) {
    const transfers = tx.tokenTransfers as Array<Record<string, unknown>> | undefined;
    if (!transfers) continue;

    for (const t of transfers) {
      if (t.mint) tokens.add(t.mint as string);
    }

    const nativeChange = (tx.nativeTransfers as Array<Record<string, unknown>> | undefined)?.[0];
    if (nativeChange) {
      const amount = (nativeChange.amount as number) ?? 0;
      if (amount > 0) wins++;
      else {
        losses++;
        maxLoss = Math.max(maxLoss, Math.abs(amount));
      }
    }
  }

  const totalTrades = wins + losses;
  if (totalTrades === 0) return null;

  const winRate = wins / totalTrades;
  const frequency = totalTrades;
  const diversity = tokens.size;
  const consistency = winRate * sc.consistencyMultiplier;
  const age = sc.placeholderAgeDays;
  const w = sc.weights;

  const compositeScore =
    winRate * w.winRate +
    (1 - Math.min(maxLoss / 1e9, 1)) * w.maxLoss +
    consistency * w.consistency +
    (frequency >= sc.freqMin && frequency <= sc.freqMax ? 1 : 0.5) * w.frequency +
    (diversity >= sc.diversityMin ? 1 : diversity / sc.diversityMin) * w.diversity +
    (age >= sc.ageMinDays ? 1 : age / sc.ageMinDays) * w.age;

  const archetype = winRate > sc.archetypeSniper.minWinRate && frequency > sc.archetypeSniper.minFreq
    ? "sniper"
    : frequency < sc.archetypeSwingMaxFreq
    ? "swing"
    : "scalper";

  return {
    walletAddress: "",
    compositeScore,
    archetype,
    winRate,
    maxLoss,
    consistency,
    frequency,
    diversity,
    age,
  };
}

async function processTask(task: ScoringTask): Promise<ScoringResult | null> {
  const txs = await getTransactionsForWallet(task.walletAddress, task.heliusApiKey);
  const score = computeScore(txs);
  if (!score) return null;

  score.walletAddress = task.walletAddress;

  await db.walletScore.create({
    data: {
      walletAddress: task.walletAddress,
      winRate: score.winRate,
      maxLossPercent: score.maxLoss / 1e9,
      pnlConsistency: score.consistency,
      tradeFrequency: score.frequency,
      tokenDiversity: score.diversity,
      walletAgeDays: score.age,
      compositeScore: score.compositeScore,
      isElite: false,
      redFlags: [],
      archetype: score.archetype,
    },
  });

  return score;
}

parentPort?.on("message", async (task: ScoringTask) => {
  try {
    const result = await processTask(task);
    parentPort?.postMessage({ result });
  } catch (err) {
    parentPort?.postMessage({ error: (err as Error).message });
  }
});

process.on("beforeExit", async () => {
  await db.$disconnect();
});

process.on("exit", () => {
  db.$disconnect();
});
