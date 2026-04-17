import { BotRuntime } from "./engine/runtime.js";
import { logger } from "./utils/logger.js";

const runtime = new BotRuntime();

runtime.start().catch((error) => {
  logger.fatal({ err: error }, "trading_bot crashed");
  process.exit(1);
});