import { Suspense } from "react";
import { QuotaPageClient } from "@/features/quota/quota-page-client";

export default function QuotaPage() {
  return (
    <Suspense fallback={<QuotaPageFallback />}>
      <QuotaPageClient />
    </Suspense>
  );
}

function QuotaPageFallback() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-bg-hover/50" />
        <div className="h-8 w-32 animate-pulse rounded-lg bg-bg-hover/50" />
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="card h-20 animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="card h-80 animate-pulse" />
        <div className="card h-80 animate-pulse" />
      </div>
      <div className="card h-72 animate-pulse" />
    </div>
  );
}
