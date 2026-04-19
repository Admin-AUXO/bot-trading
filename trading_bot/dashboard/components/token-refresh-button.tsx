"use client";

import { useRouter } from "next/navigation";
import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { useState, useCallback } from "react";

export function TokenRefreshButton() {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 1000);
  }, [router]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleRefresh}
      disabled={isRefreshing}
      className="inline-flex items-center gap-1.5 border border-bg-border px-2.5 py-1.5 text-xs"
    >
      <RefreshCcw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
      {isRefreshing ? "Refreshing" : "Refresh"}
    </Button>
  );
}