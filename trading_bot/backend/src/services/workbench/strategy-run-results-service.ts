import type { DiscoveryLabMarketRegimeResponse } from "../discovery-lab-market-regime-service.js";
import type { DiscoveryLabManualEntryResult } from "../discovery-lab-manual-entry.js";
import type { DiscoveryLabManualEntryService } from "../discovery-lab-manual-entry.js";
import type { DiscoveryLabMarketRegimeService } from "../discovery-lab-market-regime-service.js";
import type { TokenEnrichmentPayload, TokenEnrichmentService } from "../enrichment/token-enrichment-service.js";
import type { StrategyRunReadService } from "./strategy-run-read-service.js";

type StrategyRunResultsServiceDeps = {
  runReads: StrategyRunReadService;
  marketRegime: DiscoveryLabMarketRegimeService;
  tokenInsight: TokenEnrichmentService;
  manualEntry: DiscoveryLabManualEntryService;
};

export class StrategyRunResultsService {
  constructor(private readonly deps: StrategyRunResultsServiceDeps) {}

  async getMarketRegime(runId: string): Promise<DiscoveryLabMarketRegimeResponse> {
    return this.deps.marketRegime.getMarketRegime(runId);
  }

  async getTokenInsight(input: { runId?: string; mint?: string }): Promise<TokenEnrichmentPayload> {
    const mint = typeof input.mint === "string" ? input.mint.trim() : "";
    if (!mint) {
      throw new Error("mint is required");
    }

    const runId = typeof input.runId === "string" ? input.runId.trim() : "";
    if (runId) {
      const run = await this.deps.runReads.getRun(runId);
      if (!run?.report) {
        throw new Error("discovery-lab run not found or not completed");
      }
      const tokenPresent = run.report.deepEvaluations.some((row) => row.mint === mint)
        || run.report.winners.some((row) => row.address === mint);
      if (!tokenPresent) {
        throw new Error("selected token was not found in the discovery-lab report");
      }
    }

    return this.deps.tokenInsight.getEnrichment(mint);
  }

  async enterManualTrade(input: {
    runId?: string;
    mint?: string;
    positionSizeUsd?: number;
    exitOverrides?: Record<string, number>;
  }): Promise<DiscoveryLabManualEntryResult> {
    return this.deps.manualEntry.enterFromRun({
      runId: input.runId ?? "",
      mint: input.mint ?? "",
      positionSizeUsd: input.positionSizeUsd,
      exitOverrides: input.exitOverrides,
    });
  }
}
