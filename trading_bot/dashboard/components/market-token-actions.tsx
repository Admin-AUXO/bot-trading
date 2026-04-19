"use client";

import Link from "next/link";
import { Pin, PinOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { readMarketWatchlist, writeMarketWatchlist } from "@/lib/market-watchlist";

export function MarketTokenActions(props: { mint: string; birdeyeHref: string }) {
  const [isPinned, setIsPinned] = useState(() => readMarketWatchlist().has(props.mint));

  useEffect(() => {
    const sync = () => {
      setIsPinned(readMarketWatchlist().has(props.mint));
    };
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [props.mint]);

  const togglePin = () => {
    const next = readMarketWatchlist();
    if (next.has(props.mint)) {
      next.delete(props.mint);
    } else {
      next.add(props.mint);
    }
    writeMarketWatchlist(next);
    setIsPinned(next.has(props.mint));
    window.dispatchEvent(new StorageEvent("storage"));
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Button type="button" variant="ghost" size="sm" onClick={togglePin}>
        {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        {isPinned ? "Unpin" : "Pin"}
      </Button>
      <Link
        href="/operational-desk/trading"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "inline-flex")}
      >
        Trading desk
      </Link>
      <Link
        href="/market/trending"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "inline-flex")}
      >
        Trending board
      </Link>
      <a
        href={props.birdeyeHref}
        target="_blank"
        rel="noreferrer"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "inline-flex")}
      >
        Open in Birdeye
      </a>
    </div>
  );
}
