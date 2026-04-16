import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { UiToast } from "@/components/ui-toast";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const space = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
  weight: ["500", "600", "700"],
});

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
      <body suppressHydrationWarning className={`${jakarta.variable} ${space.variable} font-sans antialiased`}>
        <AppShell>{children}</AppShell>
        <UiToast />
      </body>
    </html>
  );
}
