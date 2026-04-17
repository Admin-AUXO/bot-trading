"use client";

import { useTransition } from "react";
import {
  Command,
  PauseCircle,
  PlayCircle,
  RefreshCcw,
} from "lucide-react";
import type { DeskShellPayload } from "@/lib/types";
import { StatusPill } from "@/components/dashboard-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ShellActionsProps {
  shell: DeskShellPayload | null;
  shellError: string | null;
  actionError: string | null;
  isPending: boolean;
  onRefresh: () => void;
  onCommandOpen: () => void;
  onRunAction: (actionId: DeskShellPayload["availableActions"][number]["id"], confirmation?: string) => void;
}

export function ShellActions({
  shell,
  shellError,
  actionError,
  isPending,
  onRefresh,
  onCommandOpen,
  onRunAction,
}: ShellActionsProps) {
  const liveArmAction = (shell?.availableActions ?? []).find((action) => isLiveArmAction(action)) ?? null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={onCommandOpen} variant="ghost" size="default" title="Command launcher">
        <Command className="h-4 w-4" />
        <Badge className="px-2 py-1 tracking-normal">K</Badge>
      </Button>
      <Button onClick={onRefresh} variant="ghost" title="Refresh">
        <RefreshCcw className="h-4 w-4" />
      </Button>
      {liveArmAction ? (
        <Button
          onClick={() => onRunAction(liveArmAction.id, liveArmAction.confirmation)}
          disabled={!liveArmAction.enabled || isPending}
          variant="default"
        >
          <PlayCircle className="h-4 w-4" />
          {liveArmAction.label}
        </Button>
      ) : null}
      {(shell?.availableActions ?? []).filter((a) => !isLiveArmAction(a)).map((action) => (
        <Button
          key={action.id}
          onClick={() => onRunAction(action.id, action.confirmation)}
          disabled={!action.enabled || isPending}
          variant="ghost"
          size="sm"
        >
          {action.id === "pause" ? <PauseCircle className="h-4 w-4" /> : <RefreshCcw className="h-4 w-4" />}
          {action.label}
        </Button>
      ))}
    </div>
  );
}

function isLiveArmAction(action: DeskShellPayload["availableActions"][number]) {
  return action.id === "resume" && action.label === "Start Auto Live Bot";
}
