"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Sidebar } from "@/components/layout/Sidebar";
import { Navbar } from "@/components/layout/Navbar";
import { ThemeCustomizer } from "@/components/theme/ThemeCustomizer";
import { Bot, ShieldAlert } from "lucide-react";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  const isAuthPage = pathname === "/login" || pathname === "/register";

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated && !isAuthPage) {
        router.push("/login");
      }
    }
  }, [isAuthenticated, isLoading, isAuthPage, router]);

  // Auth pages (login / register) render standalone
  if (isAuthPage) {
    return (
      <div className="min-h-screen">
        {children}
        <ThemeCustomizer />
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface-bg space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-primary via-primary-hover to-amber-500 text-white flex items-center justify-center shadow-mat-glow animate-pulse">
          <Bot className="w-8 h-8" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-xs font-bold text-content-main tracking-tight">
            Clever AI Team
          </p>
          <p className="text-[11px] text-content-muted font-mono animate-pulse">
            Verifying platform session & constitutional keys...
          </p>
        </div>
      </div>
    );
  }

  // Not authenticated fallback while redirect triggers
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface-bg space-y-4">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 flex items-center justify-center">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <p className="text-xs text-content-muted">Redirecting to sign in...</p>
      </div>
    );
  }

  // Authenticated application layout
  return (
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
  );
}
