import pino from "pino";
import { config } from "../config/index.js";

const transport = config.env === "development"
  ? pino.transport({
      target: "pino-pretty",
      options: { colorize: true, translateTime: "SYS:HH:MM:ss", sync: false },
    })
  : undefined;

export const logger = pino(
  { level: config.logLevel, base: { pid: false }, timestamp: pino.stdTimeFunctions.isoTime },
  transport,
);

export const createChildLogger = (name: string) => logger.child({ module: name });
