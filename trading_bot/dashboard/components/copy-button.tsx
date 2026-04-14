"use client";

import clsx from "clsx";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

export function CopyButton(props: { value: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(props.value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className={clsx("btn-ghost inline-flex items-center gap-2 border border-bg-border px-3 py-2 text-xs", props.className)}
      title={`Copy ${props.label}`}
      aria-label={`Copy ${props.label}`}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : props.label}
    </button>
  );
}
