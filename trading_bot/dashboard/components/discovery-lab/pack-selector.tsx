"use client";

import { useState } from "react";
import { fetchJson } from "@/lib/api";
import type { DiscoveryLabCatalog, DiscoveryLabPack, DiscoveryLabPackDraft } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";

export type PackSelectorOnSelect = (pack: DiscoveryLabPack) => void;

interface PackSelectorProps {
  catalog: DiscoveryLabCatalog;
  selectedPackId: string;
  draft: DiscoveryLabPackDraft;
  dirty: boolean;
  onSelect: PackSelectorOnSelect;
}

export function displayPackName(pack?: Pick<DiscoveryLabPack, "id" | "name"> | null): string {
  const name = pack?.name?.trim();
  if (name && name.length > 0) return name;
  if (!pack?.id) return "Default";
  return pack.id.replace(/^discovery-lab\.recipes\.?/, "").replace(/^discovery-lab/, "default").replace(/[._-]+/g, " ").trim() || "Default";
}

export function PackSelector({ catalog, selectedPackId, draft, dirty, onSelect }: PackSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" disabled={true}>
        {draft.name || "Draft"}
      </Button>
      <SeparatorPackSelector />
      <select
        value={selectedPackId || "__draft__"}
        onChange={e => {
          if (e.target.value === "__draft__") return;
          const pack = catalog.packs.find(p => p.id === e.target.value);
          if (pack) onSelect(pack);
        }}
        className="h-8 rounded-md border border-[#2a2a35] bg-[#1a1a1f] px-2 text-xs text-text-primary outline-none"
      >
        {catalog.packs.map(p => (
          <option key={p.id} value={p.id}>{displayPackName(p)}</option>
        ))}
      </select>
    </div>
  );
}

function SeparatorPackSelector() {
  return <div className="h-6 w-px bg-[#2a2a35]" />;
}

export function DraftBadge({ dirty }: { dirty: boolean }) {
  if (!dirty) return null;
  return <Badge variant="warning">Unsaved</Badge>;
}
