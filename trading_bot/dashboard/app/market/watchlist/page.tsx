import Link from "next/link";
import { CompactPageHeader } from "@/components/dashboard-primitives";
import { PinnedItemsStrip } from "@/components/pinned-items";
import { buttonVariants } from "@/components/ui/button";
import { marketRoutes } from "@/lib/dashboard-routes";

export const dynamic = "force-dynamic";

export default function MarketWatchlistPage() {
  return (
    <div className="space-y-5">
      <CompactPageHeader
        eyebrow="Market intel"
        title="Watchlist"
        description="Pinned desk rows live here until the token-level market watchlist gets its own first-class page."
        actions={(
          <Link href={marketRoutes.trending} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open trending board
          </Link>
        )}
      />

      <PinnedItemsStrip compactEmpty className="bg-bg-hover/25" />
    </div>
  );
}
