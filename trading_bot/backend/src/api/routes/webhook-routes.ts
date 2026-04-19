import crypto from "node:crypto";
import type express from "express";
import type { ApiServerDeps } from "./types.js";
import { env } from "../../config/env.js";

type RawBodyRequest = express.Request & { rawBody?: string };

const webhookRateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 100;

function rateLimitMiddleware(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const entry = webhookRateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    webhookRateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    next();
    return;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    res.status(429).json({ error: "rate limit exceeded" });
    return;
  }

  entry.count++;
  next();
}

export function registerWebhookRoutes(app: express.Express, deps: ApiServerDeps): void {
  app.post("/webhooks/helius/smart-wallet", rateLimitMiddleware, async (req, res) => {
    const rawBody = readRawBody(req);
    const signature = readSignature(req);
    if (!verifyHeliusSignature(rawBody, signature)) {
      return res.status(401).json({ error: "invalid signature" });
    }
    await deps.ingestHeliusSmartWalletWebhook(req.body, rawBody, signature);
    return res.status(204).end();
  });

  app.post("/webhooks/helius/lp", rateLimitMiddleware, async (req, res) => {
    const rawBody = readRawBody(req);
    const signature = readSignature(req);
    if (!verifyHeliusSignature(rawBody, signature)) {
      return res.status(401).json({ error: "invalid signature" });
    }
    await deps.ingestHeliusLpWebhook(req.body, rawBody, signature);
    return res.status(204).end();
  });

  app.post("/webhooks/helius/holders", rateLimitMiddleware, async (req, res) => {
    const rawBody = readRawBody(req);
    const signature = readSignature(req);
    if (!verifyHeliusSignature(rawBody, signature)) {
      return res.status(401).json({ error: "invalid signature" });
    }
    await deps.ingestHeliusHoldersWebhook(req.body, rawBody, signature);
    return res.status(204).end();
  });
}

function readRawBody(req: express.Request): string {
  return (req as RawBodyRequest).rawBody ?? JSON.stringify(req.body ?? {});
}

function readSignature(req: express.Request): string | undefined {
  const signature = req.headers["x-helius-signature"];
  return typeof signature === "string" ? signature : undefined;
}

function verifyHeliusSignature(rawBody: string, signature: string | undefined): boolean {
  if (!env.HELIUS_WEBHOOK_SECRET) {
    return false;
  }
  if (!signature) {
    return false;
  }
  const expected = crypto
    .createHmac("sha256", env.HELIUS_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  const actual = signature.trim().toLowerCase();
  if (expected.length !== actual.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}
