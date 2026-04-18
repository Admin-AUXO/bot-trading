import type { BotState, Candidate } from "@prisma/client";

export type DeskGateStatus = {
  allowed: boolean;
  reason?: string | null;
  retryable?: boolean | null;
};

export type DeskPrimaryBlocker = {
  label: string;
  detail: string | null;
  level: "info" | "warning" | "danger";
} | null;

export type DeskDiagnosticsIssue = {
  id: string;
  label: string;
  detail: string;
  level: "warning" | "danger";
};

export type DeskDiagnostics = {
  status: "healthy" | "warning" | "danger";
  staleComponents: string[];
  issues: DeskDiagnosticsIssue[];
};

export type DeskBudgetSnapshot = {
  projectedMonthlyUnits: number;
  monthlyBudgetUnits: number;
};

export type CandidateDeskBucket = "ready" | "risk" | "provider" | "data";

export type DeskAction = {
  id: "pause" | "resume" | "discover-now" | "evaluate-now" | "exit-check-now";
  label: string;
  enabled: boolean;
  confirmation?: string;
};

export function buildDeskPrimaryBlocker(
  botState: BotState,
  gate: DeskGateStatus,
  liveStartupPauseReason: string,
): DeskPrimaryBlocker {
  if (botState.pauseReason) {
    return {
      label: botState.pauseReason === liveStartupPauseReason ? "Live startup hold" : "Manual pause",
      detail: botState.pauseReason,
      level: "warning",
    };
  }

  if (!gate.allowed) {
    return {
      label: "Entry blocked",
      detail: gate.reason ?? null,
      level: gate.retryable ? "warning" : "danger",
    };
  }

  return null;
}

export function buildDeskAvailableActions(
  pauseReason: string | null,
  liveStartupPauseReason: string,
): DeskAction[] {
  return [
    {
      id: pauseReason ? "resume" : "pause",
      label: pauseReason === liveStartupPauseReason ? "Start Auto Live Bot" : pauseReason ? "Resume" : "Pause",
      enabled: true,
      confirmation: pauseReason === liveStartupPauseReason
        ? "Start full automated live bot now?"
        : pauseReason
          ? "Resume runtime loops and monitoring?"
          : "Pause runtime loops and monitoring?",
    },
    {
      id: "discover-now",
      label: "Discover",
      enabled: true,
      confirmation: "Run discovery now?",
    },
    {
      id: "evaluate-now",
      label: "Evaluate",
      enabled: true,
      confirmation: "Run evaluation now?",
    },
    {
      id: "exit-check-now",
      label: "Exit Check",
      enabled: true,
      confirmation: "Run exit checks now?",
    },
  ];
}

export function buildDeskDiagnostics(
  botState: BotState,
  budget: DeskBudgetSnapshot,
  latestPayloadFailures = 0,
): DeskDiagnostics {
  const staleComponents: string[] = [];
  const issues: DeskDiagnosticsIssue[] = [];
  const now = Date.now();

  if (!botState.lastDiscoveryAt || now - botState.lastDiscoveryAt.getTime() > 30 * 60 * 1000) {
    staleComponents.push("discovery");
    issues.push({
      id: "discovery-stale",
      label: "Discovery stale",
      detail: botState.lastDiscoveryAt
        ? `Last discovery ran at ${botState.lastDiscoveryAt.toISOString()}.`
        : "Discovery has not run yet.",
      level: "warning",
    });
  }

  if (!botState.lastEvaluationAt || now - botState.lastEvaluationAt.getTime() > 20 * 60 * 1000) {
    staleComponents.push("evaluation");
    issues.push({
      id: "evaluation-stale",
      label: "Evaluation stale",
      detail: botState.lastEvaluationAt
        ? `Last evaluation ran at ${botState.lastEvaluationAt.toISOString()}.`
        : "Evaluation has not run yet.",
      level: "warning",
    });
  }

  if (budget.projectedMonthlyUnits >= budget.monthlyBudgetUnits) {
    issues.push({
      id: "budget-hot",
      label: "Birdeye pace above cap",
      detail: `${budget.projectedMonthlyUnits}/${budget.monthlyBudgetUnits} projected monthly units.`,
      level: "danger",
    });
  } else if (budget.projectedMonthlyUnits >= budget.monthlyBudgetUnits * 0.85) {
    issues.push({
      id: "budget-warning",
      label: "Birdeye pace elevated",
      detail: `${budget.projectedMonthlyUnits}/${budget.monthlyBudgetUnits} projected monthly units.`,
      level: "warning",
    });
  }

  if (latestPayloadFailures > 0) {
    issues.push({
      id: "payload-failures",
      label: "Recent payload failures",
      detail: `${latestPayloadFailures} provider payload failures recorded in the last six hours.`,
      level: latestPayloadFailures >= 5 ? "danger" : "warning",
    });
  }

  const status: "healthy" | "warning" | "danger" = issues.some((issue) => issue.level === "danger")
    ? "danger"
    : issues.length > 0
      ? "warning"
      : "healthy";

  return { status, staleComponents, issues };
}

export function buildCandidateBucketCounts(rows: Candidate[]) {
  const counts = new Map<CandidateDeskBucket, number>([
    ["ready", 0],
    ["risk", 0],
    ["provider", 0],
    ["data", 0],
  ]);

  for (const row of rows) {
    const bucket = getCandidateBucket(row);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  return ([
    ["ready", "Ready or queued"],
    ["risk", "Blocked by risk"],
    ["provider", "Blocked by provider"],
    ["data", "Blocked by data quality"],
  ] as const).map(([bucket, label]) => ({
    bucket,
    label,
    count: counts.get(bucket) ?? 0,
  }));
}

export function getCandidateBucket(row: Candidate): CandidateDeskBucket {
  if (row.status === "ERROR") return "provider";
  if (row.status === "SKIPPED") return "risk";
  if (row.status === "DISCOVERED" || row.status === "ACCEPTED" || row.status === "BOUGHT") return "ready";

  const reason = `${row.rejectReason ?? ""} ${JSON.stringify(asRecord(row.metadata))}`.toLowerCase();
  if (/provider|birdeye|helius|timeout|429|upstream|payload|response|fetch/.test(reason)) {
    return "provider";
  }
  if (/pause|max .*open|daily loss|consecutive loss|quote capital|capital|slot/.test(reason)) {
    return "risk";
  }
  return "data";
}

export function getCandidateBucketLabel(bucket: CandidateDeskBucket): string {
  switch (bucket) {
    case "ready":
      return "Ready or queued";
    case "risk":
      return "Risk or capacity blocker";
    case "provider":
      return "Provider or runtime blocker";
    case "data":
      return "Data-quality blocker";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}
