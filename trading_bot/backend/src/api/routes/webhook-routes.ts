import type express from "express";
import type { ApiServerDeps } from "./types.js";

type RawBodyRequest = express.Request & { rawBody?: string };

export function registerWebhookRoutes(app: express.Express, deps: ApiServerDeps): void {
  app.post("/webhooks/helius/smart-wallet", async (req, res) => {
    const rawBody = readRawBody(req);
    const signature = readSignature(req);
    await deps.ingestHeliusSmartWalletWebhook(req.body, rawBody, signature);
    return res.status(204).end();
  });

  app.post("/webhooks/helius/lp", async (req, res) => {
    const rawBody = readRawBody(req);
    const signature = readSignature(req);
    await deps.ingestHeliusLpWebhook(req.body, rawBody, signature);
    return res.status(204).end();
  });

  app.post("/webhooks/helius/holders", async (req, res) => {
    const rawBody = readRawBody(req);
    const signature = readSignature(req);
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
