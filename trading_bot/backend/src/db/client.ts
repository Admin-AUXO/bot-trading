import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../config/index.js";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: config.db.url, idleTimeoutMillis: config.db.idleTimeoutMs });
  return new PrismaClient({
    adapter,
    log: config.env === "development" ? ["warn", "error"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (config.env !== "production") globalForPrisma.prisma = db;
