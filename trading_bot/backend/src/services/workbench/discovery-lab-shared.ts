import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  KNOWN_SOURCES,
  type DiscoveryLabPack,
  type DiscoveryLabPackKind,
  type DiscoveryLabThresholdOverrides,
} from "../discovery-lab-pack-types.js";

export const DISCOVERY_LAB_PROFILES = ["runtime", "high-value", "scalp"] as const;
export const DISCOVERY_LAB_KNOWN_SOURCES = KNOWN_SOURCES;

export async function writeJsonFileAtomic(
  filePath: string,
  value: unknown,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fs.rm(filePath, { force: true }).catch(() => undefined);
      await fs.rename(tempPath, filePath);
      return;
    } catch (error) {
      if (!(error instanceof Error) || attempt === 4) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}

export function pushThresholdArgs(
  args: string[],
  overrides: DiscoveryLabThresholdOverrides,
): void {
  const flags: Array<[keyof DiscoveryLabThresholdOverrides, string]> = [
    ["minLiquidityUsd", "--min-liquidity-usd"],
    ["maxMarketCapUsd", "--max-market-cap-usd"],
    ["minHolders", "--min-holders"],
    ["minVolume5mUsd", "--min-volume-5m-usd"],
    ["minUniqueBuyers5m", "--min-unique-buyers-5m"],
    ["minBuySellRatio", "--min-buy-sell-ratio"],
    ["maxTop10HolderPercent", "--max-top10-holder-percent"],
    ["maxSingleHolderPercent", "--max-single-holder-percent"],
    ["maxNegativePriceChange5mPercent", "--max-negative-price-change-5m-percent"],
  ];
  for (const [key, flag] of flags) {
    const value = overrides[key];
    if (value === undefined) {
      continue;
    }
    args.push(flag, String(value));
  }
}

export function appendOutput(current: string, next: string): string {
  const combined = `${current}${next}`;
  return combined.length > 32_000 ? combined.slice(-32_000) : combined;
}

export function extractFailureMessage(stderr: string, stdout: string): string {
  const stderrLines = stderr
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const meaningfulStderrLines = stderrLines.filter((line) => {
    return !(
      line === "^"
      || line.startsWith("npm notice")
      || line.startsWith("Node.js v")
      || line.startsWith("at ")
      || line.startsWith("node:")
    );
  });
  const preferredErrorLine = meaningfulStderrLines.find((line) =>
    /error|failed|cannot|not found|invalid|unauthorized/i.test(line),
  );
  if (preferredErrorLine) {
    return preferredErrorLine;
  }
  if (meaningfulStderrLines.length > 0) {
    return meaningfulStderrLines.at(-1) ?? "discovery lab run failed";
  }
  if (stderrLines.length > 0) {
    return stderrLines.at(0) ?? "discovery lab run failed";
  }
  const stdoutLines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (stdoutLines.length > 0) {
    return stdoutLines.at(-1) ?? "discovery lab run failed";
  }
  return "discovery lab run failed";
}

export function mapPackKindForDb(
  pack: Pick<DiscoveryLabPack, "kind" | "id">,
): "CREATED" | "WORKSPACE" | "CUSTOM" {
  if (pack.kind === "created") {
    return "CREATED";
  }
  if (pack.id.startsWith("workspace-")) {
    return "WORKSPACE";
  }
  return "CUSTOM";
}

export function mapPackKindFromDb(kind: string): DiscoveryLabPackKind {
  if (kind === "CREATED") {
    return "created";
  }
  return "custom";
}

export function buildStrategyPackSnapshot(pack: DiscoveryLabPack) {
  return {
    recipe: {
      profile: pack.defaultProfile,
      sources: pack.defaultSources,
      recipes: pack.recipes,
      targetPnlBand: pack.targetPnlBand ?? null,
    },
    baseFilters: pack.thresholdOverrides ?? {},
    baseExits: {},
    adaptiveAxes: {},
    capitalModifier: new Prisma.Decimal(100),
    sortColumn: null,
    sortOrder: null,
    createdBy: `${pack.kind}:${pack.sourcePath ?? "local"}`,
  };
}

export function isWorkspacePackId(packId: string): boolean {
  return packId.startsWith("workspace-");
}
