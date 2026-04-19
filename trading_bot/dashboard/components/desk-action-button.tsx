"use client";

import { useTransition } from "react";
import { PlayCircle, Radar } from "lucide-react";
import { fetchJson } from "@/lib/api";
import { Button, buttonVariants } from "@/components/ui/button";
import type { DeskShellPayload } from "@/lib/types";

interface DeskDiscoverButtonProps {
  variant?: "default" | "secondary";
  size?: "default" | "sm" | "lg";
  className?: string;
  label?: string;
}

export function DeskDiscoverButton({
  variant = "default",
  size = "sm",
  className,
  label = "Run discovery",
}: DeskDiscoverButtonProps) {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      try {
        await fetchJson("/control/discover-now", { method: "POST" });
        window.dispatchEvent(new CustomEvent("desk-refresh"));
      } catch {
        // silently fail - the action endpoint will surface errors via the shell
      }
    });
  };

  return (
    <Button
      onClick={handleClick}
      disabled={isPending}
      variant={variant}
      size={size}
      className={className}
    >
      <Radar className="h-4 w-4" />
      {isPending ? "Starting..." : label}
    </Button>
  );
}

interface DeskEvaluateButtonProps {
  variant?: "default" | "secondary";
  size?: "default" | "sm" | "lg";
  className?: string;
  label?: string;
}

export function DeskEvaluateButton({
  variant = "default",
  size = "sm",
  className,
  label = "Run evaluation",
}: DeskEvaluateButtonProps) {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      try {
        await fetchJson("/control/evaluate-now", { method: "POST" });
        window.dispatchEvent(new CustomEvent("desk-refresh"));
      } catch {
        // silently fail
      }
    });
  };

  return (
    <Button
      onClick={handleClick}
      disabled={isPending}
      variant={variant}
      size={size}
      className={className}
    >
      <PlayCircle className="h-4 w-4" />
      {isPending ? "Starting..." : label}
    </Button>
  );
}