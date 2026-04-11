"use client";

import { ArrowUpRight } from "lucide-react";
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
  return (
    <div className="row-actions">
      <a
        href={props.openHref}
        className="btn-ghost inline-flex items-center gap-2 border border-bg-border px-3 py-2 text-xs"
        title={`Open ${props.openLabel}`}
      >
        Open
        <ArrowUpRight className="h-3.5 w-3.5" />
      </a>
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
  );
}
