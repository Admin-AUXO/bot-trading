"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { InlineNotice, Panel, StatusPill } from "@/components/dashboard-primitives";
import { buttonVariants } from "@/components/ui/button";
import { operationalDeskRoutes, workbenchRoutes, marketRoutes } from "@/lib/dashboard-routes";

export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="space-y-5">
      <Panel
        title="Page unavailable"
        eyebrow="Route error"
        description="The shell stayed up. The page data did not. Retry or pivot somewhere useful."
        action={<StatusPill value="degraded" />}
        tone="critical"
      >
        <div className="space-y-4">
          <InlineNotice tone="danger" className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-text-primary">Fetch or render failed</div>
              <div className="mt-1 text-xs leading-5 text-current">
                {error.message || "Unknown route failure."}
              </div>
            </div>
          </InlineNotice>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => reset()} className={buttonVariants({ variant: "default", size: "sm" })}>
              <RefreshCcw className="h-4 w-4" />
              Retry
            </button>
            <Link href={operationalDeskRoutes.overview} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Desk overview
            </Link>
            <Link href={workbenchRoutes.packs} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Pack workspace
            </Link>
            <Link href={marketRoutes.trending} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Market pulse
            </Link>
          </div>
        </div>
      </Panel>
    </div>
  );
}
