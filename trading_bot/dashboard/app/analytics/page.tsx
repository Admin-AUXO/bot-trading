import { Suspense } from "react";
import { AnalyticsPageClient } from "@/app/analytics/analytics-page-client";

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<AnalyticsPageFallback />}>
      <AnalyticsPageClient />
    </Suspense>
  );
}

function AnalyticsPageFallback() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-64 rounded-lg bg-bg-hover/50 animate-pulse" />
        <div className="h-8 w-20 rounded-lg bg-bg-hover/50 animate-pulse" />
      </div>
      <div className="card h-56 animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card h-48 animate-pulse" />
        <div className="card h-48 animate-pulse" />
        <div className="card h-48 animate-pulse" />
      </div>
    </div>
  );
}
