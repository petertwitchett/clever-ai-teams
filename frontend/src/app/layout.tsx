import type { Metadata } from "next";
import "@/styles/globals.scss";
import "@/styles/materialize.scss";
import "@/styles/animations.scss";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Sidebar } from "@/components/layout/Sidebar";
import { Navbar } from "@/components/layout/Navbar";
import { ThemeCustomizer } from "@/components/theme/ThemeCustomizer";

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
          <div className="min-h-screen flex">
            {/* Left Vertical Sidebar */}
            <Sidebar />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 md:pl-64">
              <Navbar />
              <main className="flex-1 px-4 md:px-6 pb-10">{children}</main>
            </div>

            {/* Floating Materialize Theme Customizer */}
            <ThemeCustomizer />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
