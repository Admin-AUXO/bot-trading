"use client";

import clsx from "clsx";
import { useEffect, useRef } from "react";
import type { DeskShellPayload } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface CommandPaletteProps {
  open: boolean;
  commandQuery: string;
  selectedCommandIndex: number;
  commandItems: Array<{
    id: string;
    label: string;
    hint: string;
    icon: React.ComponentType<{ className?: string }>;
    type: "Route" | "Action";
    run: () => void;
  }>;
  onCommandOpenChange: (open: boolean) => void;
  onCommandQueryChange: (query: string) => void;
  onSelectedCommandIndexChange: (index: number) => void;
}

export function CommandPalette({
  open,
  commandQuery,
  selectedCommandIndex,
  commandItems,
  onCommandOpenChange,
  onCommandQueryChange,
  onSelectedCommandIndexChange,
}: CommandPaletteProps) {
  const commandInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      onCommandQueryChange("");
      onSelectedCommandIndexChange(0);
      return;
    }
    commandInputRef.current?.focus();
  }, [open, onCommandQueryChange, onSelectedCommandIndexChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 py-16" onClick={() => onCommandOpenChange(false)}>
      <Card className="w-full max-w-xl rounded-[18px] bg-[var(--surface-modal-strong)]" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Command</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 rounded-[14px] border border-bg-border bg-[#0f0f10] px-4 py-3">
            <Input
              ref={commandInputRef}
              value={commandQuery}
              onChange={(e) => { onCommandQueryChange(e.target.value); onSelectedCommandIndexChange(0); }}
              placeholder="Search commands..."
              className="h-auto border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0"
            />
          </div>
          {commandItems.length > 0 ? (
            <div className="max-h-80 space-y-1 overflow-auto">
              {commandItems.map((item, idx) => {
                const Icon = item.icon;
                const isSelected = idx === selectedCommandIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onMouseEnter={() => onSelectedCommandIndexChange(idx)}
                    onClick={() => { item.run(); onCommandOpenChange(false); }}
                    className={clsx(
                      "flex w-full items-center gap-3 rounded-[12px] border px-3 py-2 text-left transition",
                      isSelected ? "border-[rgba(163,230,53,0.25)] bg-[#11140f]" : "border-bg-border bg-[#101012] hover:bg-[#141417]",
                    )}
                  >
                    <Icon className={clsx("h-4 w-4", isSelected ? "text-accent" : "text-text-secondary")} />
                    <span className="flex-1 truncate text-sm text-text-primary">{item.label}</span>
                    <Badge className="normal-case">{item.type}</Badge>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-4 text-center text-sm text-text-muted">No matches</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

