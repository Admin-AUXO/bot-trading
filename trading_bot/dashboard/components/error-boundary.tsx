"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }> {
  state: { hasError: boolean; error?: Error };

  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

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
        </div>
      );
    }
    return this.props.children;
  }
}
