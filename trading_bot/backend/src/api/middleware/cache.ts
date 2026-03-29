import { LRUCache } from "lru-cache";
import type { Request, Response, NextFunction } from "express";
import { config } from "../../config/index.js";

const store = new LRUCache<string, { body: unknown; ts: number }>({ max: config.api.responseCacheMaxEntries });

function matchesPrefix(key: string, prefix: string): boolean {
  return key === prefix || key.startsWith(`${prefix}?`) || key.startsWith(`${prefix}/`);
}

export function invalidateResponseCache(prefixes?: readonly string[]): void {
  if (!prefixes?.length) {
    store.clear();
    return;
  }

  for (const key of store.keys()) {
    if (prefixes.some((prefix) => matchesPrefix(key, prefix))) {
      store.delete(key);
    }
  }
}

export function cacheMiddleware(ttlMs: number, keyFn?: (req: Request) => string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyFn ? keyFn(req) : req.originalUrl;
    const cached = store.get(key);
    if (cached && Date.now() - cached.ts < ttlMs) {
      res.json(cached.body);
      return;
    }

    const origJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        store.set(key, { body, ts: Date.now() });
      }
      return origJson(body);
    }) as typeof res.json;

    next();
  };
}
