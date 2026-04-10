import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  HELIUS_RPC_URL: z.string().url(),
  BIRDEYE_API_KEY: z.string().min(1),
  CONTROL_API_SECRET: z.string().min(1).optional(),
  BOT_PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  TRADE_MODE: z.enum(["DRY_RUN", "LIVE"]).default("DRY_RUN"),
  DISCOVERY_INTERVAL_MS: z.coerce.number().int().positive().default(180_000),
  DISCOVERY_LOOKBACK_SECONDS: z.coerce.number().int().positive().default(300),
  EVALUATION_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
  EXIT_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  ENTRY_DELAY_MS: z.coerce.number().int().nonnegative().default(45_000),
  EVALUATION_CONCURRENCY: z.coerce.number().int().positive().max(10).default(2),
  CAPITAL_USD: z.coerce.number().positive().default(200),
  POSITION_SIZE_USD: z.coerce.number().positive().default(50),
  MAX_OPEN_POSITIONS: z.coerce.number().int().positive().default(2),
  MIN_LIQUIDITY_USD: z.coerce.number().nonnegative().default(5_000),
  MAX_MARKET_CAP_USD: z.coerce.number().positive().default(150_000),
  MIN_HOLDERS: z.coerce.number().int().nonnegative().default(200),
  MIN_UNIQUE_BUYERS_5M: z.coerce.number().int().nonnegative().default(40),
  MIN_BUY_SELL_RATIO: z.coerce.number().nonnegative().default(1.5),
  MAX_TOP10_HOLDER_PERCENT: z.coerce.number().nonnegative().default(30),
  MAX_SINGLE_HOLDER_PERCENT: z.coerce.number().nonnegative().default(12),
  MAX_GRADUATION_AGE_SECONDS: z.coerce.number().int().positive().default(300),
  MIN_VOLUME_5M_USD: z.coerce.number().nonnegative().default(1_000),
  MAX_NEGATIVE_PRICE_CHANGE_5M_PERCENT: z.coerce.number().nonnegative().default(20),
  SECURITY_CHECK_MIN_LIQUIDITY_USD: z.coerce.number().nonnegative().default(20_000),
  SECURITY_CHECK_VOLUME_MULTIPLIER: z.coerce.number().positive().default(5),
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
  MAINTENANCE_INTERVAL_MS: z.coerce.number().int().positive().default(21_600_000),
  RAW_PAYLOAD_RETENTION_DAYS: z.coerce.number().int().positive().default(45),
  SNAPSHOT_RETENTION_DAYS: z.coerce.number().int().positive().default(120),
  API_EVENT_RETENTION_DAYS: z.coerce.number().int().positive().default(180),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid trading_bot environment:\n${issues}`);
}

export const env = parsed.data;
