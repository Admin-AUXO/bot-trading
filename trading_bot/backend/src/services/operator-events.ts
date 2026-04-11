import { db } from "../db/client.js";
import { toJsonValue } from "../utils/json.js";

export type OperatorEventLevel = "info" | "warning" | "danger";

export type OperatorEventRecordInput = {
  kind: string;
  level?: OperatorEventLevel;
  title: string;
  detail?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function recordOperatorEvent(input: OperatorEventRecordInput) {
  return db.operatorEvent.create({
    data: {
      kind: input.kind,
      level: input.level ?? "info",
      title: input.title,
      detail: input.detail ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      metadata: input.metadata ? toJsonValue(input.metadata) : undefined,
    },
  });
}

export async function listOperatorEvents(limit = 20) {
  return db.operatorEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
}
