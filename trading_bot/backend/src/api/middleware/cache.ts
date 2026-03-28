import { LRUCache } from "lru-cache";
import type { Request, Response, NextFunction } from "express";

const store = new LRUCache<string, { body: unknown; ts: number }>({ max: 200 });

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
      store.set(key, { body, ts: Date.now() });
      return origJson(body);
    }) as typeof res.json;

    next();
  };
}
