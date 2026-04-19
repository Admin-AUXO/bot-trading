"use client";

import { LoadingSkeleton } from "@/components/dashboard-primitives";

export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="rounded-[14px] border border-bg-border bg-bg-secondary p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LoadingSkeleton className="h-6 w-32" />
            <LoadingSkeleton className="h-5 w-20" />
          </div>
          <div className="flex items-center gap-2">
            <LoadingSkeleton className="h-9 w-24" />
            <LoadingSkeleton className="h-9 w-24" />
            <LoadingSkeleton className="h-9 w-36" />
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-4">
          <LoadingSkeleton className="h-20 rounded-[14px]" />
          <LoadingSkeleton className="h-20 rounded-[14px]" />
          <LoadingSkeleton className="h-20 rounded-[14px]" />
          <LoadingSkeleton className="h-20 rounded-[14px]" />
        </div>
      </div>

      <LoadingSkeleton className="h-32 rounded-[14px]" />

      <div className="grid gap-6 2xl:grid-cols-[1.02fr_0.98fr]">
        <LoadingSkeleton className="h-64 rounded-[14px]" />
        <LoadingSkeleton className="h-64 rounded-[14px]" />
      </div>

      <LoadingSkeleton className="h-48 rounded-[14px]" />

      <LoadingSkeleton className="h-48 rounded-[14px]" />
    </div>
  );
}