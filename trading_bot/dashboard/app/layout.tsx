import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { LoadingSkeleton } from "@/components/dashboard-primitives";
import { UiToast } from "@/components/ui-toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Graduation Control",
  description: "Operator dashboard for the graduation bot",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="darkreader-lock" />
      </head>
      <body
        suppressHydrationWarning
        className="font-sans antialiased"
        style={{
          ["--font-body" as string]: "\"Manrope\", \"Segoe UI\", system-ui, sans-serif",
          ["--font-heading" as string]: "\"Space Grotesk\", \"Arial Nova\", \"Segoe UI\", sans-serif",
          ["--font-mono" as string]:
            "\"Geist Mono\", ui-monospace, \"SFMono-Regular\", \"SF Mono\", Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
        }}
      >
        <AppShell>
          <Suspense
            fallback={
              <div className="space-y-4">
                <LoadingSkeleton className="h-20 w-full" />
                <LoadingSkeleton className="h-40 w-full" />
              </div>
            }
          >
            {children}
          </Suspense>
        </AppShell>
        <UiToast />
      </body>
    </html>
  );
}
