import type { Metadata } from "next";
import "./globals.css";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Providers } from "./providers";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { PageTransition } from "@/components/layout/page-transition";
import { ConnectionBanner } from "@/components/ui/connection-banner";
import { KeyboardShortcutsProvider } from "@/components/layout/keyboard-provider";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Solana Trading Bot",
  description: "Trading dashboard",
  icons: {
    icon: [
      { url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📊</text></svg>", type: "image/svg+xml" },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <NuqsAdapter>
        <Providers>
          <KeyboardShortcutsProvider />
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex-1 ml-0 lg:ml-56 flex flex-col min-h-screen">
              <ConnectionBanner />
              <Header />
              <main className="flex-1 p-4 lg:p-6">
                <PageTransition>{children}</PageTransition>
              </main>
              <Footer />
            </div>
          </div>
          <Toaster
            position="bottom-right"
            toastOptions={{
              className: "!bg-bg-card !border-bg-border !text-text-primary",
            }}
          />
        </Providers>
        </NuqsAdapter>
      </body>
    </html>
  );
}
