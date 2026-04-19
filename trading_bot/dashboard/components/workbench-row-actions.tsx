"use client";

import clsx from "clsx";
import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, Ellipsis } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { PinToggleButton, type PinnedItem } from "@/components/pinned-items";

export function WorkbenchRowActions(props: {
  openHref: string;
  openLabel: string;
  grafanaHref?: string | null;
  pinItem: Omit<PinnedItem, "createdAt">;
  copyValue: string;
  copyLabel: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <div className="row-actions hidden md:flex">
        <Link
          href={props.openHref as Route}
          prefetch={false}
          className="btn-ghost inline-flex items-center gap-2 border border-bg-border px-3 py-2 text-xs"
          title={`Open ${props.openLabel}`}
        >
          Open
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
        <PinToggleButton item={props.pinItem} />
        {props.grafanaHref ? (
          <a
            href={props.grafanaHref}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost inline-flex items-center gap-2 border border-bg-border px-3 py-2 text-xs"
            title={`Open ${props.openLabel} in Grafana`}
          >
            Grafana
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        ) : null}
        <CopyButton value={props.copyValue} label={props.copyLabel} />
      </div>

      <div className="relative md:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
          className={clsx(
            "btn-ghost inline-flex items-center gap-2 border border-bg-border px-3 py-2 text-xs",
            menuOpen && "border-[rgba(163,230,53,0.28)] bg-[#121511] text-text-primary",
          )}
          title={`Open actions for ${props.openLabel}`}
          aria-label={`Open actions for ${props.openLabel}`}
        >
          Actions
          <Ellipsis className="h-3.5 w-3.5" />
        </button>

        {menuOpen ? (
          <div className="floating-menu absolute right-0 top-[calc(100%+0.45rem)] z-20 grid min-w-[11rem] gap-2 p-2">
            <Link
              href={props.openHref as Route}
              prefetch={false}
              onClick={() => setMenuOpen(false)}
              className="btn-ghost inline-flex items-center justify-between gap-2 border border-bg-border px-3 py-2 text-xs"
              title={`Open ${props.openLabel}`}
            >
              Open
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <PinToggleButton item={props.pinItem} className="justify-center" />
            {props.grafanaHref ? (
              <a
                href={props.grafanaHref}
                target="_blank"
                rel="noreferrer"
                onClick={() => setMenuOpen(false)}
                className="btn-ghost inline-flex items-center justify-between gap-2 border border-bg-border px-3 py-2 text-xs"
                title={`Open ${props.openLabel} in Grafana`}
              >
                Grafana
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            ) : null}
            <CopyButton value={props.copyValue} label={props.copyLabel} className="w-full justify-center" />
          </div>
        ) : null}
      </div>
    </>
  );
}
