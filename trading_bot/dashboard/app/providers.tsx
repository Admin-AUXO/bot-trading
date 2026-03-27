"use client";

import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { useDashboardStore } from "@/lib/store";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    const { setConnected } = useDashboardStore.getState();
    return new QueryClient({
      queryCache: new QueryCache({
        onError: () => setConnected(false),
        onSuccess: () => setConnected(true),
      }),
      defaultOptions: {
        queries: {
          staleTime: 5000,
          gcTime: 5 * 60 * 1000,
          retry: false,
          refetchOnWindowFocus: true,
        },
      },
    });
  });

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
