import "dotenv/config";
import { z } from "zod";

const optionalNonEmptyString = z.string().trim().transform((value) => (value.length > 0 ? value : undefined)).optional();
const csvListSchema = (fallback: string) => z.string().default(fallback).transform((value) => value
  .split(",")
  .map((item) => item.trim())
  .filter((item) => item.length > 0));

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  HELIUS_RPC_URL: z.string().url(),
  BIRDEYE_API_KEY: z.string().min(1),
  JUPITER_API_KEY: optionalNonEmptyString,
  BOT_PORT: z.coerce.number().default(3101),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  TRADE_MODE: z.enum(["DRY_RUN", "LIVE"]).default("DRY_RUN"),
  DISCOVERY_SOURCES: csvListSchema("pump_dot_fun"),
  TRADABLE_SOURCES: csvListSchema("pump_dot_fun"),
  DISCOVERY_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),
  OFF_HOURS_DISCOVERY_INTERVAL_MS: z.coerce.number().int().positive().default(900_000),
  DISCOVERY_LOOKBACK_SECONDS: z.coerce.number().int().positive().default(86_400),
  DISCOVERY_SORT_BY: z.string().min(1).default("last_trade_unix_time"),
  DISCOVERY_SORT_TYPE: z.enum(["asc", "desc"]).default("desc"),
  DISCOVERY_QUERY_MIN_LIQUIDITY_USD: z.coerce.number().nonnegative().default(5_000),
  DISCOVERY_QUERY_MIN_VOLUME_5M_USD: z.coerce.number().nonnegative().default(0),
  DISCOVERY_QUERY_MIN_HOLDERS: z.coerce.number().int().nonnegative().default(0),
  DISCOVERY_QUERY_MIN_LAST_TRADE_SECONDS: z.coerce.number().int().nonnegative().default(3_600),
  EVALUATION_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  IDLE_EVALUATION_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  EXIT_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  ENTRY_DELAY_MS: z.coerce.number().int().nonnegative().default(60_000),
  EVALUATION_CONCURRENCY: z.coerce.number().int().positive().max(10).default(2),
  RESEARCH_DISCOVERY_LIMIT: z.coerce.number().int().positive().max(100).default(100),
  RESEARCH_FULL_EVALUATION_LIMIT: z.coerce.number().int().positive().max(100).default(25),
  RESEARCH_MAX_MOCK_POSITIONS: z.coerce.number().int().positive().max(20).default(5),
  RESEARCH_FIXED_POSITION_SIZE_USD: z.coerce.number().positive().default(25),
  RESEARCH_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(120_000),
  RESEARCH_MAX_RUN_DURATION_MS: z.coerce.number().int().positive().default(600_000),
  RESEARCH_BIRDEYE_UNIT_CAP: z.coerce.number().int().positive().default(3_000),
  RESEARCH_HELIUS_UNIT_CAP: z.coerce.number().int().positive().default(100),
  LIVE_STRATEGY_PRESET_ID: z.enum(["FIRST_MINUTE_POSTGRAD_CONTINUATION", "LATE_CURVE_MIGRATION_SNIPE"]).default("FIRST_MINUTE_POSTGRAD_CONTINUATION"),
  DRY_RUN_STRATEGY_PRESET_ID: z.enum(["FIRST_MINUTE_POSTGRAD_CONTINUATION", "LATE_CURVE_MIGRATION_SNIPE"]).default("LATE_CURVE_MIGRATION_SNIPE"),
  HELIUS_MIGRATION_WATCHER_ENABLED: z.coerce.boolean().default(true),
  HELIUS_MIGRATION_WATCH_PROGRAM_IDS: csvListSchema(""),
  HELIUS_MIGRATION_WATCH_DEBOUNCE_MS: z.coerce.number().int().positive().default(15_000),
  CAPITAL_USD: z.coerce.number().positive().default(100),
  POSITION_SIZE_USD: z.coerce.number().positive().default(25),
  MAX_OPEN_POSITIONS: z.coerce.number().int().positive().default(3),
  MIN_LIQUIDITY_USD: z.coerce.number().nonnegative().default(10_000),
  MAX_MARKET_CAP_USD: z.coerce.number().positive().default(150_000),
  MIN_HOLDERS: z.coerce.number().int().nonnegative().default(100),
  MIN_UNIQUE_BUYERS_5M: z.coerce.number().int().nonnegative().default(25),
  MIN_BUY_SELL_RATIO: z.coerce.number().nonnegative().default(1.3),
  MAX_TOP10_HOLDER_PERCENT: z.coerce.number().nonnegative().default(25),
  MAX_SINGLE_HOLDER_PERCENT: z.coerce.number().nonnegative().default(10),
  MAX_GRADUATION_AGE_SECONDS: z.coerce.number().int().positive().default(86_400),
  MIN_VOLUME_5M_USD: z.coerce.number().nonnegative().default(2_000),
  MAX_NEGATIVE_PRICE_CHANGE_5M_PERCENT: z.coerce.number().nonnegative().default(12),
  SECURITY_CHECK_MIN_LIQUIDITY_USD: z.coerce.number().nonnegative().default(10_000),
  SECURITY_CHECK_VOLUME_MULTIPLIER: z.coerce.number().positive().default(1),
  MAX_TRANSFER_FEE_PERCENT: z.coerce.number().nonnegative().default(5),
  STOP_LOSS_PERCENT: z.coerce.number().positive().default(25),
  TP1_MULTIPLIER: z.coerce.number().positive().default(1.4),
  TP2_MULTIPLIER: z.coerce.number().positive().default(2.2),
  TP1_SELL_FRACTION: z.coerce.number().positive().max(1).default(0.4),
  TP2_SELL_FRACTION: z.coerce.number().positive().max(1).default(0.4),
  POST_TP1_RETRACE_PERCENT: z.coerce.number().positive().default(15),
  TRAILING_STOP_PERCENT: z.coerce.number().positive().default(20),
  TIME_STOP_MINUTES: z.coerce.number().positive().default(20),
  TIME_STOP_MIN_RETURN_PERCENT: z.coerce.number().nonnegative().default(5),
  TIME_LIMIT_MINUTES: z.coerce.number().positive().default(45),
  DAILY_LOSS_LIMIT_USD: z.coerce.number().nonnegative().default(8),
  MAX_CONSECUTIVE_LOSSES: z.coerce.number().int().nonnegative().default(2),
  MAINTENANCE_INTERVAL_MS: z.coerce.number().int().positive().default(21_600_000),
  RAW_PAYLOAD_RETENTION_DAYS: z.coerce.number().int().positive().default(45),
  SNAPSHOT_RETENTION_DAYS: z.coerce.number().int().positive().default(120),
  API_EVENT_RETENTION_DAYS: z.coerce.number().int().positive().default(180),
  CAPTURE_SUCCESS_RAW_PAYLOADS: z.coerce.boolean().default(false),
  US_HOURS_TIMEZONE: z.string().min(1).default("America/New_York"),
  US_HOURS_START_HOUR: z.coerce.number().int().min(0).max(23).default(9),
  US_HOURS_END_HOUR: z.coerce.number().int().min(1).max(24).default(21),
  BIRDEYE_MONTHLY_CU_BUDGET: z.coerce.number().int().positive().default(1_500_000),
  BIRDEYE_DISCOVERY_BUDGET_SHARE: z.coerce.number().positive().max(1).default(0.55),
  BIRDEYE_EVALUATION_BUDGET_SHARE: z.coerce.number().positive().max(1).default(0.25),
  BIRDEYE_SECURITY_BUDGET_SHARE: z.coerce.number().positive().max(1).default(0.1),
  BIRDEYE_RESERVE_BUDGET_SHARE: z.coerce.number().positive().max(1).default(0.1),
  TRADING_WALLET_PRIVATE_KEY_B58: optionalNonEmptyString,
  LIVE_QUOTE_MINT: z.string().min(1).default("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
  LIVE_QUOTE_DECIMALS: z.coerce.number().int().min(0).max(12).default(6),
  LIVE_MIN_SOL_RESERVE_SOL: z.coerce.number().positive().default(0.02),
  LIVE_TIP_LAMPORTS: z.coerce.number().int().positive().default(200_000),
  LIVE_SLIPPAGE_BPS: z.coerce.number().int().positive().max(5_000).default(150),
  LIVE_JUPITER_API_BASE_URL: z.string().url().default("https://lite-api.jup.ag/swap/v1"),
  LIVE_PRIORITY_LEVEL: z.string().min(1).default("veryHigh"),
  LIVE_MAX_PRIORITY_FEE_LAMPORTS: z.coerce.number().int().positive().default(1_000_000),
  LIVE_RESTRICT_INTERMEDIATE_TOKENS: z.coerce.boolean().default(true),
  LIVE_HELIUS_SENDER_URL: z.string().url().default("https://sender.helius-rpc.com/fast"),
  CONTROL_API_SECRET: optionalNonEmptyString,
  BIRDEYE_BUDGET_EMERGENCY_BYPASS: z.coerce.boolean().default(false),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid trading_bot environment:\n${issues}`);
}

const budgetShareTotal = parsed.data.BIRDEYE_DISCOVERY_BUDGET_SHARE
  + parsed.data.BIRDEYE_EVALUATION_BUDGET_SHARE
  + parsed.data.BIRDEYE_SECURITY_BUDGET_SHARE
  + parsed.data.BIRDEYE_RESERVE_BUDGET_SHARE;

if (Math.abs(budgetShareTotal - 1) > 0.0001) {
  throw new Error(`Invalid trading_bot environment:\nBirdeye budget shares must sum to 1.0, got ${budgetShareTotal}`);
}

if (parsed.data.US_HOURS_START_HOUR >= parsed.data.US_HOURS_END_HOUR) {
  throw new Error("Invalid trading_bot environment:\nUS_HOURS_START_HOUR must be lower than US_HOURS_END_HOUR");
}

export const env = parsed.data;
