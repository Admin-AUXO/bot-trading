import "dotenv/config";
import { startTradingBot } from "./bootstrap/runtime.js";
import { createChildLogger } from "./utils/logger.js";

const log = createChildLogger("main");

startTradingBot().catch((err) => {
  log.fatal({ err }, "bot crashed");
  process.exit(1);
});
