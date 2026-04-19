import { LoadingSkeleton } from "@/components/dashboard-primitives";

export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="rounded-[16px] border border-bg-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-2.5 md:p-3">
        <LoadingSkeleton className="h-16 w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <LoadingSkeleton className="h-40 w-full" />
            <LoadingSkeleton className="h-40 w-full" />
          </div>
          <LoadingSkeleton className="h-32 w-full" />
          <LoadingSkeleton className="h-32 w-full" />
        </div>
        <div className="hidden lg:block">
          <LoadingSkeleton className="h-40 w-full" />
        </div>
      </div>
    </div>
  );
}