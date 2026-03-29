"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { DashboardFiltersProvider } from "@/hooks/use-dashboard-filters";
import { DashboardShellProvider } from "@/hooks/use-dashboard-shell";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    return new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5000,
            gcTime: 5 * 60 * 1000,
            retry: false,
            refetchOnWindowFocus: false,
          },
        },
      });
  });

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <DashboardShellProvider>
          <DashboardFiltersProvider>{children}</DashboardFiltersProvider>
        </DashboardShellProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
