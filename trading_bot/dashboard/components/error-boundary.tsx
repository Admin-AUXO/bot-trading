"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; onReset?: () => void }
> {
  state: { hasError: boolean; error?: Error };

  constructor(props: { children: ReactNode; fallback?: ReactNode; onReset?: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  reset = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[16px] border border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.08)] p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-[var(--danger)]" />
          <div className="text-sm font-semibold text-text-primary">Something went wrong</div>
          <div className="text-xs text-text-muted">
            {this.state.error?.message ?? "An unexpected error occurred"}
          </div>
          <Button variant="secondary" size="sm" onClick={this.reset}>
            <RefreshCcw className="h-3.5 w-3.5" />
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
