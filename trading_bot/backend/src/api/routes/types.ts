import type express from "express";
import type { BotSettings, RuntimeSnapshot } from "../../types/domain.js";
import type {
  DiscoveryLabCatalog,
  DiscoveryLabPackDraft,
  DiscoveryLabRunRequest,
} from "../../services/discovery-lab-service.js";
import type { DiscoveryLabMarketRegimeResponse } from "../../services/discovery-lab-market-regime-service.js";
import type { DiscoveryLabMarketStatsPayload } from "../../services/discovery-lab-market-stats-service.js";
import type { DiscoveryLabStrategySuggestionsPayload } from "../../services/discovery-lab-strategy-suggestion-service.js";
import type { TokenEnrichmentPayload } from "../../services/enrichment/token-enrichment-service.js";
import type {
  OperatorPackDetailPayload,
  OperatorPackListPayload,
  OperatorRunGradePayload,
  OperatorRunDetailPayload,
  OperatorRunListPayload,
  OperatorRunTuningPayload,
} from "../../types/domain.js";

export type ApiServerDeps = {
  getSnapshot: () => Promise<RuntimeSnapshot>;
  getDeskShell: () => Promise<unknown>;
  getDeskHome: () => Promise<unknown>;
  listDeskEvents: (limit?: number) => Promise<unknown[]>;
  listPacks: (limit?: number) => Promise<OperatorPackListPayload>;
  validatePack: (input: DiscoveryLabPackDraft, allowOverfiltered?: boolean) => Promise<unknown>;
  getPack: (packId: string) => Promise<OperatorPackDetailPayload | null>;
  savePack: (input: DiscoveryLabPackDraft) => Promise<OperatorPackDetailPayload>;
  deletePack: (packId: string) => Promise<{ ok: true }>;
  listRuns: (limit?: number, packId?: string) => Promise<OperatorRunListPayload>;
  getRunDetail: (runId: string) => Promise<OperatorRunDetailPayload | null>;
  gradeRun: (runId: string, input?: { persist?: boolean }) => Promise<OperatorRunGradePayload>;
  suggestRunTuning: (runId: string, input?: { apply?: boolean }) => Promise<OperatorRunTuningPayload>;
  startRunFromPack: (packId: string, input: Omit<DiscoveryLabRunRequest, "packId">) => Promise<unknown>;
  applyRunToLive: (input: {
    runId: string;
    mode?: "DRY_RUN" | "LIVE";
    confirmation: string;
    liveDeployToken?: string;
    requestIp?: string | null;
  }) => Promise<unknown>;
  getRunMarketRegime: (runId: string) => Promise<DiscoveryLabMarketRegimeResponse>;
  getRunTokenInsight: (input: { runId?: string; mint?: string }) => Promise<TokenEnrichmentPayload>;
  enterRunManualTrade: (input: {
    runId?: string;
    mint?: string;
    positionSizeUsd?: number;
    exitOverrides?: Record<string, number>;
  }) => Promise<unknown>;
  listSessions: (limit?: number) => Promise<unknown>;
  getCurrentSession: () => Promise<unknown | null>;
  startSession: (input: {
    runId: string;
    mode?: "DRY_RUN" | "LIVE";
    confirmation: string;
    liveDeployToken?: string;
    requestIp?: string | null;
  }) => Promise<unknown>;
  stopSession: (sessionId: string, reason?: string) => Promise<unknown>;
  pauseSession: (sessionId: string, reason?: string) => Promise<unknown>;
  resumeSession: (sessionId: string) => Promise<unknown>;
  revertSession: (input: {
    sessionId: string;
    mode?: "DRY_RUN" | "LIVE";
    confirmation: string;
    liveDeployToken?: string;
    requestIp?: string | null;
  }) => Promise<unknown>;
  listCandidateQueue: (bucket: "ready" | "risk" | "provider" | "data") => Promise<unknown>;
  getCandidateDetail: (candidateId: string) => Promise<unknown | null>;
  listPositionBook: (book: "open" | "closed") => Promise<unknown>;
  getPositionDetail: (positionId: string) => Promise<unknown | null>;
  getDiagnostics: () => Promise<unknown>;
  getSettings: () => Promise<BotSettings>;
  patchSettings: (input: Partial<BotSettings>) => Promise<BotSettings>;
  pause: (reason?: string) => Promise<void>;
  resume: () => Promise<void>;
  triggerDiscovery: () => Promise<void>;
  triggerEvaluation: () => Promise<void>;
  triggerExitCheck: () => Promise<void>;
  getDiscoveryLabCatalog: () => Promise<DiscoveryLabCatalog>;
  validateDiscoveryLabDraft: (input: DiscoveryLabPackDraft, allowOverfiltered?: boolean) => Promise<unknown>;
  saveDiscoveryLabPack: (input: DiscoveryLabPackDraft) => Promise<unknown>;
  deleteDiscoveryLabPack: (packId: string) => Promise<unknown>;
  startDiscoveryLabRun: (input: DiscoveryLabRunRequest) => Promise<unknown>;
  listDiscoveryLabRuns: () => Promise<unknown>;
  getDiscoveryLabRun: (runId: string) => Promise<unknown | null>;
  getDiscoveryLabMarketRegime: (runId: string) => Promise<DiscoveryLabMarketRegimeResponse>;
  getMarketTrending: (input?: { mint?: string; limit?: number; refresh?: boolean; focusOnly?: boolean }) => Promise<DiscoveryLabMarketStatsPayload>;
  getMarketStrategySuggestions: (input?: { refresh?: boolean }) => Promise<DiscoveryLabStrategySuggestionsPayload>;
  getEnrichment: (mint: string) => Promise<TokenEnrichmentPayload>;
  getDiscoveryLabTokenInsight: (input: { runId?: string; mint?: string }) => Promise<unknown>;
  enterDiscoveryLabManualTrade: (input: {
    runId?: string;
    mint?: string;
    positionSizeUsd?: number;
    exitOverrides?: Record<string, number>;
  }) => Promise<unknown>;
  applyDiscoveryLabLiveStrategy: (input: {
    runId?: string;
    mode?: "DRY_RUN" | "LIVE";
    confirmation?: string;
    liveDeployToken?: string;
    requestIp?: string | null;
  }) => Promise<unknown>;
};

export type AuthMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => void;

export type RespondWithDeskState = (
  res: express.Response,
  action: string,
) => Promise<void>;

export type RouteRegistrarContext = {
  deps: ApiServerDeps;
  authMiddleware: AuthMiddleware;
  respondWithDeskState: RespondWithDeskState;
};
