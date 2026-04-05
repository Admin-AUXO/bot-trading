import ky from "ky";

const api = ky.create({
  prefixUrl: "/",
  timeout: 10_000,
});

export type TradeMode = "LIVE" | "DRY_RUN";
export type TradeSource = "AUTO" | "MANUAL";
export type ApiService = "HELIUS" | "BIRDEYE" | "JUPITER" | "JITO";
export type QuotaStatus = "HEALTHY" | "SOFT_LIMIT" | "HARD_LIMIT" | "PAUSED";
export type QuotaSource = "INTERNAL" | "PROVIDER" | "MIXED";

export interface ExecutionScope {
  mode: TradeMode;
  configProfile: string;
}

export interface Position {
  id: string;
  strategy: string;
  tokenAddress: string;
  tokenSymbol: string;
  platform: string | null;
  walletSource: string | null;
  entryPriceUsd: number;
  currentPriceUsd: number;
  amountSol: number;
  remainingAmountSol?: number;
  remainingToken: number;
  remainingValueUsd?: number;
  peakPriceUsd: number;
  stopLossPercent: number;
  tranche1Filled: boolean;
  tranche2Filled: boolean;
  exit1Done: boolean;
  exit2Done: boolean;
  exit3Done: boolean;
  status: string;
  exitReason: string | null;
  pnlUsd: number | null;
  pnlPercent: number;
  regime: string;
  openedAt: string;
  closedAt: string | null;
  holdMinutes?: number;
  mode?: TradeMode;
  configProfile?: string;
  tradeSource?: TradeSource;
}

export interface Trade {
  id: string;
  strategy: string;
  tokenSymbol: string;
  tokenAddress: string;
  side: string;
  amountSol: number;
  priceUsd: number;
  pnlUsd: number;
  pnlPercent: number;
  exitReason: string | null;
  gasFee: number;
  jitoTip: number;
  txSignature: string;
  regime: string;
  executedAt: string;
  mode?: TradeMode;
  configProfile?: string;
  tradeSource?: TradeSource;
}

export interface Signal {
  id: string;
  strategy: string;
  tokenAddress: string;
  tokenSymbol: string;
  signalType: string;
  source: string;
  passed: boolean;
  rejectReason: string | null;
  filterResults: Record<string, unknown>;
  detectedAt: string;
}

export interface SkippedSignal {
  id: string;
  strategy: string;
  tokenAddress: string;
  tokenSymbol: string;
  signalType: string;
  source: string;
  rejectReason: string | null;
  filterResults: Record<string, unknown>;
  regime: string | null;
  tokenLiquidity: number | null;
  tokenMcap: number | null;
  tokenVolume5m: number | null;
  buyPressure: number | null;
  priceAtSignal: number | null;
  detectedAt: string;
}

export interface DailyStat {
  date: string;
  strategy: string | null;
  tradesTotal: number;
  tradesWon: number;
  tradesLost: number;
  winRate: number;
  grossPnlUsd: number;
  netPnlUsd: number;
  capitalEnd: number;
  maxDrawdownUsd: number;
  regime: string;
  mode?: TradeMode;
  configProfile?: string;
}

export interface StrategyPerformance {
  strategy: string;
  totalExits: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlUsd: number;
  avgWinUsd: number;
  avgLossUsd: number;
  totalFeesSol: number;
}

export interface ExecutionQuality {
  strategy: string;
  buyCount: number;
  sellCount: number;
  avgEntrySlippageBps: number;
  avgExitSlippageBps: number;
  avgFeeSol: number;
  avgEntryLatencyMs: number;
  avgCopyLeadMs: number;
  manualShare: number;
}

export interface CapitalPoint {
  date: string;
  capital: number;
  dailyPnl: number;
  cumulativePnl: number;
}

export interface RegimeSnapshot {
  id: string;
  regime: string;
  solPrice: number;
  solChange5m: number;
  solChange1h: number;
  trendingCount: number;
  rollingWinRate: number;
  snappedAt: string;
}

export interface BudgetSnapshot {
  service: ApiService;
  date: string;
  budgetTotal: number;
  monthlyUsed: number;
  monthlyRemaining: number;
  dailyBudget: number;
  dailyUsed: number;
  dailyRemaining: number;
  essentialCredits: number;
  nonEssentialCredits: number;
  cachedCalls: number;
  totalCalls: number;
  avgCreditsPerCall: number;
  softLimitPct: number;
  hardLimitPct: number;
  quotaStatus: QuotaStatus;
  quotaSource: QuotaSource;
  providerCycleStart: string | null;
  providerCycleEnd: string | null;
  providerReportedUsed: number | null;
  providerReportedRemaining: number | null;
  providerReportedOverage: number | null;
  providerReportedOverageCost: number | null;
  pauseReason: string | null;
}

export interface ApiUsageMonthlySummary {
  service: ApiService;
  totalCredits: number;
  totalCalls: number;
  totalErrors: number;
}

export interface ApiEndpointUsage {
  service: ApiService;
  endpoint: string;
  strategy: string | null;
  mode: TradeMode | null;
  configProfile: string | null;
  purpose: string;
  essential: boolean;
  totalCalls: number;
  totalCredits: number;
  cachedCalls: number;
  errorCount: number;
  avgCreditsPerCall: number;
  avgLatencyMs: number;
  avgBatchSize: number;
}

export interface ApiUsageResponse {
  current: BudgetSnapshot[] | null;
  daily: BudgetSnapshot[];
  monthly: ApiUsageMonthlySummary[];
  history: BudgetSnapshot[];
  endpointFilter: {
    mode: TradeMode | null;
    profile: string | null;
  };
  topEndpoints: ApiEndpointUsage[];
  windowDays: number;
}

export interface ConfigProfile {
  id: string;
  name: string;
  description: string;
  mode: TradeMode;
  settings: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStrategyProfileOverrides {
  positionSizeSol?: number;
  maxSlippageBps?: number;
  maxSourceTxAgeSeconds?: number;
  minUniqueHolders?: number;
  maxGraduationAgeAtEntrySeconds?: number;
  requireTradeDataInLive?: boolean;
}

export interface DashboardProfileSettings {
  s1?: DashboardStrategyProfileOverrides;
  s2?: DashboardStrategyProfileOverrides;
  s3?: DashboardStrategyProfileOverrides;
  capitalUsd?: number;
  dailyLossPercent?: number;
  weeklyLossPercent?: number;
}

export interface ProfileResults {
  profile: string;
  mode: TradeMode;
  totalTrades: number;
  totalExits: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlUsd: number;
  trades: Trade[];
  positions: Position[];
}

export interface ProfileResultsSummary {
  profile: string;
  mode: TradeMode;
  totalTrades: number;
  totalExits: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlUsd: number;
}

export interface WouldHaveWonSignal {
  id: string;
  strategy: string;
  tokenSymbol: string;
  tokenAddress: string;
  rejectReason: string | null;
  wouldHaveWon: boolean | null;
  priceAtSignal: number | null;
  priceAfter5m: number | null;
  priceAfter15m: number | null;
  priceAfter1h: number | null;
  detectedAt: string;
}

export interface WalletActivityItem {
  id: string;
  walletAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  action: string;
  amountSol: number | null;
  priceAtTrade: number | null;
  priceAfter1m: number | null;
  priceAfter5m: number | null;
  priceAfter15m: number | null;
  priceAfter1h: number | null;
  peakPriceAfter: number | null;
  detectedAt: string;
}

export interface PnlDistributionPoint {
  pnlUsd: number;
  pnlPercent: number;
  strategy: string;
  exitReason: string | null;
}

export interface PositionHistorySummary {
  closedCount: number;
  wins: number;
  losses: number;
  netPnlUsd: number;
  avgPnlPercent: number;
}

export interface PositionHistoryResponse {
  data: Position[];
  total: number;
  page: number;
  totalPages: number;
  summary: PositionHistorySummary;
}

export interface TradesSummary {
  totalTrades: number;
  totalExits: number;
  wins: number;
  losses: number;
  netPnlUsd: number;
  totalFeesSol: number;
  lastExecutedAt: string | null;
}

export interface TradesResponse {
  data: Trade[];
  total: number;
  page: number;
  totalPages: number;
  summary: TradesSummary;
}

export interface SignalsSummary {
  totalSignals: number;
  passed: number;
  rejected: number;
  passRate: number;
  topRejectReason: string | null;
  topRejectCount: number;
  lastDetectedAt: string | null;
}

export interface SignalsResponse<TSignal = Signal> {
  data: TSignal[];
  total: number;
  page: number;
  totalPages: number;
  summary: SignalsSummary;
}

export interface OverviewResponse {
  scope: ExecutionScope;
  capitalUsd: number;
  capitalSol: number;
  walletBalance: number;
  dailyLossUsd: number;
  weeklyLossUsd: number;
  dailyLossLimit: number;
  weeklyLossLimit: number;
  capitalLevel: string;
  regime: {
    regime: string;
    solPrice: number;
    solChange5m: number;
    solChange1h: number;
    trendingCount: number;
    rollingWinRate: number;
  };
  rollingWinRate: number;
  isRunning: boolean;
  pauseReason: string | null;
  pauseReasons: string[];
  quotaSnapshots: BudgetSnapshot[];
  lastTradeAt: string | null;
  lastSignalAt: string | null;
  openPositions: Position[];
  todayTrades: number;
  todayPnl: number;
  todayWins: number;
  todayLosses: number;
  mode: TradeMode;
  configProfile: string;
}

type RawOverviewResponse = Omit<OverviewResponse, "quotaSnapshots"> & {
  quotaSnapshots?: BudgetSnapshot[] | null;
  currentQuotaSnapshots?: BudgetSnapshot[] | null;
};

export function normalizeOverviewResponse(payload: RawOverviewResponse): OverviewResponse {
  return {
    ...payload,
    quotaSnapshots: payload.quotaSnapshots ?? payload.currentQuotaSnapshots ?? [],
  };
}

export interface HeartbeatResponse {
  scope: ExecutionScope;
  isRunning: boolean;
  uptime: number;
  lastTradeAt: string | null;
  lastSignalAt: string | null;
  memoryMb: number;
}

export interface StrategyConfigResponse {
  scope: ExecutionScope;
  strategies: Record<string, {
    maxPositions: number;
    configuredPositionSize: number;
    effectivePositionSize: number;
    stopLoss: number;
    maxSlippageBps: number;
    timeStopMinutes: number;
    timeLimitMinutes?: number;
    maxSourceTxAgeSeconds?: number;
    minUniqueHolders?: number;
    maxGraduationAgeAtEntrySeconds?: number;
    requireTradeDataInLive?: boolean;
    exitPlan: {
      tp1ThresholdPct: number;
      tp2ThresholdPct: number;
      tp1SizePct: number;
      tp2SizePct: number;
      runnerSizePct: number;
      trailingStopPercent: number;
    };
  }>;
  risk: {
    dailyLossLimit: number;
    weeklyLossLimit: number;
    walletBalance: number;
    maxOpenPositions: number;
    gasReserve: number;
    capitalLevel: string;
    pauseReason: string | null;
    pauseReasons: string[];
  };
}

function withParams(path: string, params?: URLSearchParams): string {
  const query = params?.toString();
  return query ? `${path}?${query}` : path;
}

export async function fetchOverview() {
  const payload = await api.get("api/overview").json<RawOverviewResponse>();
  return normalizeOverviewResponse(payload);
}

export async function fetchApiUsage(days: number = 14, mode?: TradeMode, profile?: string) {
  const params = new URLSearchParams({ days: String(days) });
  if (mode) params.set("mode", mode);
  if (profile) params.set("profile", profile);
  return api.get(withParams("api/overview/api-usage", params)).json<ApiUsageResponse>();
}

export async function fetchPositions(mode?: TradeMode, profile?: string, tradeSource?: TradeSource) {
  const params = new URLSearchParams();
  if (mode) params.set("mode", mode);
  if (profile) params.set("profile", profile);
  if (tradeSource) params.set("tradeSource", tradeSource);
  return api.get(withParams("api/positions", params)).json<Position[]>();
}

export async function fetchPositionHistory(
  page: number = 1,
  strategy?: string,
  mode?: TradeMode,
  profile?: string,
  tradeSource?: TradeSource,
) {
  const params = new URLSearchParams({ page: String(page) });
  if (strategy) params.set("strategy", strategy);
  if (mode) params.set("mode", mode);
  if (profile) params.set("profile", profile);
  if (tradeSource) params.set("tradeSource", tradeSource);
  return api.get(withParams("api/positions/history", params)).json<PositionHistoryResponse>();
}

export async function fetchTrades(
  page: number = 1,
  strategy?: string,
  mode?: TradeMode,
  profile?: string,
  tradeSource?: TradeSource,
) {
  const params = new URLSearchParams({ page: String(page) });
  if (strategy) params.set("strategy", strategy);
  if (mode) params.set("mode", mode);
  if (profile) params.set("profile", profile);
  if (tradeSource) params.set("tradeSource", tradeSource);
  return api.get(withParams("api/trades", params)).json<TradesResponse>();
}

export async function fetchSignalsPaginated(
  page: number = 1,
  strategy?: string,
  mode?: TradeMode,
  profile?: string,
) {
  const params = new URLSearchParams({ page: String(page) });
  if (strategy) params.set("strategy", strategy);
  if (mode) params.set("mode", mode);
  if (profile) params.set("profile", profile);
  return api.get(withParams("api/trades/signals", params)).json<SignalsResponse>();
}

export async function fetchSkippedSignals(
  page: number = 1,
  strategy?: string,
  mode?: TradeMode,
  profile?: string,
) {
  const params = new URLSearchParams({ page: String(page), skipped: "true" });
  if (strategy) params.set("strategy", strategy);
  if (mode) params.set("mode", mode);
  if (profile) params.set("profile", profile);
  return api.get(withParams("api/trades/signals", params)).json<SignalsResponse<SkippedSignal>>();
}

export async function fetchDailyStats(days: number = 30, mode?: TradeMode, profile?: string) {
  const params = new URLSearchParams({ days: String(days) });
  if (mode) params.set("mode", mode);
  if (profile) params.set("profile", profile);
  return api.get(withParams("api/analytics/daily", params)).json<DailyStat[]>();
}

export async function fetchStrategyAnalytics(
  days: number = 30,
  mode?: TradeMode,
  profile?: string,
  tradeSource?: TradeSource,
) {
  const params = new URLSearchParams({ days: String(days) });
  if (mode) params.set("mode", mode);
  if (profile) params.set("profile", profile);
  if (tradeSource) params.set("tradeSource", tradeSource);
  return api.get(withParams("api/analytics/strategy", params)).json<StrategyPerformance[]>();
}

export async function fetchExecutionQuality(
  days: number = 14,
  mode?: TradeMode,
  profile?: string,
  tradeSource?: TradeSource,
) {
  const params = new URLSearchParams({ days: String(days) });
  if (mode) params.set("mode", mode);
  if (profile) params.set("profile", profile);
  if (tradeSource) params.set("tradeSource", tradeSource);
  return api.get(withParams("api/analytics/execution-quality", params)).json<ExecutionQuality[]>();
}

export async function fetchCapitalCurve(days: number = 30, mode?: TradeMode, profile?: string) {
  const params = new URLSearchParams({ days: String(days) });
  if (mode) params.set("mode", mode);
  if (profile) params.set("profile", profile);
  return api.get(withParams("api/analytics/capital-curve", params)).json<CapitalPoint[]>();
}

export async function fetchRegimeHistory() {
  return api.get("api/analytics/regime-history").json<RegimeSnapshot[]>();
}

export async function pauseBot() {
  return api.post("api/control/pause").json();
}

export async function resumeBot() {
  return api.post("api/control/resume").json();
}

export async function fetchProfiles() {
  return api.get("api/profiles").json<ConfigProfile[]>();
}

export async function fetchOperatorSessionStatus() {
  return api.get("api/operator-session").json<{
    authenticated: boolean;
    configured: boolean;
  }>();
}

export async function unlockOperatorSession(secret: string) {
  return api.post("api/operator-session", { json: { secret } }).json<{
    authenticated: boolean;
    configured: boolean;
  }>();
}

export async function clearOperatorSession() {
  return api.delete("api/operator-session").json<{ authenticated: boolean }>();
}

export async function createProfile(data: { name: string; description: string; mode: TradeMode; settings: Record<string, unknown> }) {
  return api.post("api/profiles", { json: data }).json();
}

export async function updateProfile(name: string, settings: DashboardProfileSettings) {
  return api.put(`api/profiles/${name}`, { json: { settings } }).json();
}

export async function toggleProfile(name: string, active: boolean) {
  return api.post(`api/profiles/${name}/toggle`, { json: { active } }).json();
}

export async function deleteProfile(name: string) {
  return api.delete(`api/profiles/${name}`).json();
}

export async function fetchProfileResults(name: string, mode?: TradeMode) {
  const params = new URLSearchParams();
  if (mode) params.set("mode", mode);
  return api.get(withParams(`api/profiles/${name}/results`, params)).json<ProfileResults>();
}

export async function fetchProfileResultsSummaries() {
  return api.get("api/profiles/results-summary").json<ProfileResultsSummary[]>();
}

export async function manualEntry(payload: { tokenAddress: string; tokenSymbol: string; strategy: string; amountSol?: number }) {
  return api.post("api/control/manual-entry", { json: payload }).json<{ success: boolean; txSignature?: string; error?: string }>();
}

export async function manualExit(positionId: string) {
  return api.post(`api/positions/${positionId}/manual-exit`).json<{ success: boolean; txSignature?: string; error?: string }>();
}

export async function fetchHeartbeat() {
  return api.get("api/control/heartbeat").json<HeartbeatResponse>();
}

export async function fetchStrategyConfig() {
  return api.get("api/control/config").json<StrategyConfigResponse>();
}

export async function reconcileWallet() {
  return api.post("api/control/reconcile-wallet").json<{
    scope: ExecutionScope;
    balanceSol: number;
    status: string;
  }>();
}

export async function fetchWouldHaveWon(days: number = 7, mode?: TradeMode, profile?: string) {
  const params = new URLSearchParams({ days: String(days) });
  if (mode) params.set("mode", mode);
  if (profile) params.set("profile", profile);
  return api.get(withParams("api/analytics/would-have-won", params)).json<{
    total: number;
    wouldHaveWon: number;
    wouldHaveWonRate: number;
    signals: WouldHaveWonSignal[];
  }>();
}

export async function fetchWalletActivity(limit: number = 50) {
  const params = new URLSearchParams({ limit: String(limit) });
  return api.get(withParams("api/analytics/wallet-activity", params)).json<WalletActivityItem[]>();
}

export async function fetchGraduationStats(days: number = 30) {
  const params = new URLSearchParams({ days: String(days) });
  return api.get(withParams("api/analytics/graduation-stats", params)).json<{
    totalEvents: number;
    byPlatform: Record<string, { total: number; traded: number; rugged: number }>;
  }>();
}

export async function fetchPnlDistribution(
  days: number = 30,
  mode?: TradeMode,
  profile?: string,
  tradeSource?: TradeSource,
) {
  const params = new URLSearchParams({ days: String(days) });
  if (mode) params.set("mode", mode);
  if (profile) params.set("profile", profile);
  if (tradeSource) params.set("tradeSource", tradeSource);
  return api.get(withParams("api/analytics/pnl-distribution", params)).json<PnlDistributionPoint[]>();
}

export function createSSEConnection(onMessage: (data: unknown) => void, onError?: () => void): EventSource {
  const es = new EventSource("/api/stream");
  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch (error) {
      void error;
    }
  };
  es.onerror = () => {
    onError?.();
  };
  return es;
}
