import ky from "ky";

// Use relative URLs so Next.js rewrites proxy them to the backend.
// This avoids CORS issues and Docker-internal hostname resolution in the browser.
const api = ky.create({
  prefixUrl: "/",
  timeout: 10_000,
});

// Note: ky throws on HTTP errors (4xx/5xx). Errors are caught by TanStack Query and available
// in the error state of useQuery hooks. Use getErrorMessage() to display errors in UI.

export async function fetchOverview(mode?: string) {
  const params = mode ? `?mode=${mode}` : "";
  return api.get("api/overview" + params).json<{
    capitalUsd: number;
    capitalSol: number;
    walletBalance: number;
    dailyLossUsd: number;
    weeklyLossUsd: number;
    dailyLossLimit: number;
    weeklyLossLimit: number;
    capitalLevel: string;
    regime: { regime: string; solPrice: number; solChange5m: number; solChange1h: number };
    rollingWinRate: number;
    isRunning: boolean;
    pauseReason: string | null;
    openPositions: Position[];
    todayTrades: number;
    todayPnl: number;
    todayWins: number;
    todayLosses: number;
    mode: string;
  }>();
}

export async function fetchApiUsage() {
  return api.get("api/overview/api-usage").json<{
    daily: ApiUsageDaily[];
    monthly: { service: string; _sum: { totalCredits: number; totalCalls: number } }[];
  }>();
}

export async function fetchPositions(mode?: string) {
  const params = mode ? `?mode=${mode}` : "";
  return api.get("api/positions" + params).json<Position[]>();
}

export async function fetchPositionHistory(page: number = 1, strategy?: string, mode?: string, profile?: string) {
  const params = new URLSearchParams({ page: String(page) });
  if (strategy) params.set("strategy", strategy);
  if (mode) params.set("mode", mode);
  if (profile) params.set("profile", profile);
  return api.get("api/positions/history?" + params).json<{
    data: Position[];
    total: number;
    page: number;
    totalPages: number;
  }>();
}

export async function fetchTrades(page: number = 1, strategy?: string, mode?: string, profile?: string) {
  const params = new URLSearchParams({ page: String(page) });
  if (strategy) params.set("strategy", strategy);
  if (mode) params.set("mode", mode);
  if (profile) params.set("profile", profile);
  return api.get("api/trades?" + params).json<{
    data: Trade[];
    total: number;
    page: number;
    totalPages: number;
  }>();
}

export async function fetchSignals(strategy?: string) {
  const params = strategy ? `?strategy=${strategy}` : "";
  return api.get("api/trades/signals" + params).json<Signal[]>();
}

export async function fetchDailyStats(days: number = 30, mode?: string) {
  const params = new URLSearchParams({ days: String(days) });
  if (mode) params.set("mode", mode);
  return api.get("api/analytics/daily?" + params).json<DailyStat[]>();
}

export async function fetchStrategyAnalytics(mode?: string) {
  const params = mode ? `?mode=${mode}` : "";
  return api.get("api/analytics/strategy" + params).json<StrategyPerformance[]>();
}

export async function fetchCapitalCurve(mode?: string) {
  const params = mode ? `?mode=${mode}` : "";
  return api.get("api/analytics/capital-curve" + params).json<CapitalPoint[]>();
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

export async function createProfile(data: { name: string; description: string; mode: string; settings: Record<string, unknown> }) {
  return api.post("api/profiles", { json: data }).json();
}

export async function updateProfile(name: string, settings: Record<string, unknown>) {
  return api.put(`api/profiles/${name}`, { json: { settings } }).json();
}

export async function toggleProfile(name: string, active: boolean) {
  return api.post(`api/profiles/${name}/toggle`, { json: { active } }).json();
}

export async function deleteProfile(name: string) {
  return api.delete(`api/profiles/${name}`).json();
}

export async function fetchProfileResults(name: string, mode?: string) {
  const params = mode ? `?mode=${mode}` : "";
  return api.get(`api/profiles/${name}/results` + params).json<ProfileResults>();
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
  remainingToken: number;
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
  mode?: string;
  configProfile?: string;
  tradeSource?: string;
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
  mode?: string;
  configProfile?: string;
  tradeSource?: string;
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
  mode?: string;
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

export interface ApiUsageDaily {
  service: string;
  totalCalls: number;
  totalCredits: number;
  budgetTotal: number;
  budgetUsedPercent: number;
}

export interface ConfigProfile {
  id: string;
  name: string;
  description: string;
  mode: string;
  settings: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileResults {
  profile: string;
  mode: string;
  totalTrades: number;
  totalExits: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlUsd: number;
  trades: Trade[];
  positions: Position[];
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
  priceUsd: number | null;
  priceAfter1m: number | null;
  priceAfter5m: number | null;
  priceAfter15m: number | null;
  priceAfter1h: number | null;
  peakPriceUsd: number | null;
  detectedAt: string;
}

export interface PnlDistributionPoint {
  pnlUsd: number;
  pnlPercent: number;
  strategy: string;
  exitReason: string | null;
}

export async function fetchSignalsPaginated(page: number = 1, strategy?: string) {
  const params = new URLSearchParams({ page: String(page) });
  if (strategy) params.set("strategy", strategy);
  return api.get("api/trades/signals?" + params).json<{
    data: Signal[];
    total: number;
    page: number;
    totalPages: number;
  }>();
}

export async function fetchSkippedSignals(page: number = 1) {
  const params = new URLSearchParams({ page: String(page), skipped: "true" });
  return api.get("api/trades/signals?" + params).json<{
    data: SkippedSignal[];
    total: number;
    page: number;
    totalPages: number;
  }>();
}

export async function manualEntry(payload: { tokenAddress: string; tokenSymbol: string; strategy: string; amountSol?: number }) {
  return api.post("api/control/manual-entry", { json: payload }).json<{ success: boolean; txSignature?: string; error?: string }>();
}

export async function manualExit(positionId: string) {
  return api.post(`api/positions/${positionId}/manual-exit`).json<{ success: boolean; txSignature?: string; error?: string }>();
}

export async function fetchHeartbeat() {
  return api.get("api/control/heartbeat").json<{
    isRunning: boolean;
    uptime: number;
    lastTradeAt: string | null;
    lastSignalAt: string | null;
    memoryMb: number;
  }>();
}

export async function fetchStrategyConfig() {
  return api.get("api/control/config").json<{
    strategies: Record<string, {
      maxPositions: number;
      positionSize: number;
      stopLoss: number;
      timeStop: string;
    }>;
    risk: {
      dailyLossLimit: number;
      weeklyLossLimit: number;
      maxOpenPositions: number;
      gasReserve: number;
      capitalLevel: string;
    };
  }>();
}

export async function fetchWouldHaveWon(days: number = 7) {
  return api.get(`api/analytics/would-have-won?days=${days}`).json<{
    total: number;
    wouldHaveWon: number;
    wouldHaveWonRate: number;
    signals: WouldHaveWonSignal[];
  }>();
}

export async function fetchWalletActivity(limit: number = 50) {
  return api.get(`api/analytics/wallet-activity?limit=${limit}`).json<WalletActivityItem[]>();
}

export async function fetchGraduationStats(days: number = 30) {
  return api.get(`api/analytics/graduation-stats?days=${days}`).json<{
    totalEvents: number;
    byPlatform: Record<string, { total: number; traded: number; rugged: number }>;
  }>();
}

export async function fetchPnlDistribution(days: number = 30, mode?: string) {
  const params = new URLSearchParams({ days: String(days) });
  if (mode) params.set("mode", mode);
  return api.get("api/analytics/pnl-distribution?" + params).json<PnlDistributionPoint[]>();
}

export function createSSEConnection(onMessage: (data: unknown) => void, onError?: () => void): EventSource {
  const es = new EventSource(`/api/stream`);
  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch {}
  };
  es.onerror = () => {
    onError?.();
  };
  return es;
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Unknown error";
}
