import type { Request, Response, NextFunction } from "express";
import { config } from "../../config/index.js";

export function requireBearerToken(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token || token !== config.api.controlSecret) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}
