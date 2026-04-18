import type express from "express";
import { db } from "../../db/client.js";
import { ALLOWED_SQL_VIEWS } from "./utils.js";

export function registerViewsRoutes(app: express.Express): void {
  app.get("/api/views/:name", async (req, res) => {
    const viewName = req.params.name;
    if (!ALLOWED_SQL_VIEWS.has(viewName)) {
      return res.status(404).json({ error: "view not available" });
    }
    const rows = await db.$queryRawUnsafe<unknown[]>(`SELECT * FROM "${viewName}" LIMIT 500`);
    return res.json(rows);
  });
}

