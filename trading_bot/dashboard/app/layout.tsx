import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { UiToast } from "@/components/ui-toast";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
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
        <AppShell>{children}</AppShell>
        <UiToast />
      </body>
    </html>
  );
}
