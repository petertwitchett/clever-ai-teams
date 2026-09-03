import type { Metadata } from "next";
import "@/styles/globals.scss";
import "@/styles/materialize.scss";
import "@/styles/animations.scss";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AuthProvider } from "@/lib/auth-context";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "Clever AI Team — Multi-Agent Visual Studio & Orchestration",
  description:
    "Design expert AI teams as visual graphs of person nodes with constitutional ethics, Magentic-One dual-ledger orchestration, and lifelong Voyager skill acquisition.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <AuthProvider>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
