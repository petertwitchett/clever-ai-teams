"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useTheme } from "../theme/ThemeProvider";
import { useAuth } from "@/lib/auth-context";
import { ThemeColor } from "@/lib/types";
import {
  Search,
  Sun,
  Moon,
  Bell,
  Palette,
  Check,
  User,
  ExternalLink,
  Shield,
  Activity,
  LogOut,
  Settings,
} from "lucide-react";

export function Navbar() {
  const { themeMode, setThemeMode, themeColor, setThemeColor, isDark } = useTheme();
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const colors: { id: ThemeColor; name: string; hex: string }[] = [
    { id: "purple", name: "Materialize Purple", hex: "#7367F0" },
    { id: "orange", name: "Sunset Orange", hex: "#FF9F43" },
    { id: "blue", name: "Electric Cyan", hex: "#00CFDD" },
    { id: "green", name: "Mint Emerald", hex: "#28C76F" },
    { id: "red", name: "Coral Crimson", hex: "#EA5455" },
  ];

  const { user, logout } = useAuth();

  const getInitials = () => {
    if (!user) return "SA";
    if (user.full_name) {
      const parts = user.full_name.trim().split(" ");
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return user.full_name.slice(0, 2).toUpperCase();
    }
    return user.email.slice(0, 2).toUpperCase();
  };

  return (
    <header className="sticky top-4 z-20 mx-4 md:mx-6 mb-6">
      <div className="mat-navbar-floating px-4 py-2.5 flex items-center justify-between gap-4">
        {/* Search Bar with CTRL + K */}
        <div className="flex-1 max-w-md">
          <div className="relative flex items-center">
            <Search className="absolute left-3 w-4 h-4 text-content-subtle pointer-events-none" />
            <input
              type="text"
              placeholder="Search (CTRL + K)..."
              className="mat-input pl-9 pr-12 text-xs py-2 w-full"
            />
            <kbd className="absolute right-3 px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface-hover text-content-subtle border border-surface-border">
              CTRL K
            </kbd>
          </div>
        </div>

        {/* Right Action Icons */}
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          {/* Environment Status Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-medium border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Clever Cloud: Healthy</span>
          </div>

          {/* Color Palette Switcher */}
          <div className="relative">
            <button
              onClick={() => setColorPickerOpen((prev) => !prev)}
              className="p-2 rounded-xl text-content-muted hover:text-content-main hover:bg-surface-hover transition-colors"
              title="Change Accent Color"
            >
              <Palette className="w-4 h-4" />
            </button>

            {colorPickerOpen && (
              <>
                <div
                  onClick={() => setColorPickerOpen(false)}
                  className="fixed inset-0 z-30"
                />
                <div className="absolute right-0 mt-2 p-3 rounded-xl bg-surface-card border border-surface-border shadow-mat-hover z-40 w-48 space-y-1.5 animate-fadeIn">
                  <span className="text-[11px] font-semibold text-content-subtle uppercase px-2 tracking-wider">
                    Accent Color
                  </span>
                  {colors.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setThemeColor(c.id);
                        setColorPickerOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-surface-hover text-xs text-content-main transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: c.hex }}
                        />
                        <span>{c.name}</span>
                      </div>
                      {themeColor === c.id && (
                        <Check className="w-3.5 h-3.5 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Dark / Light Toggle */}
          <button
            onClick={() => setThemeMode(isDark ? "light" : "dark")}
            className="p-2 rounded-xl text-content-muted hover:text-content-main hover:bg-surface-hover transition-colors"
            title={`Switch to ${isDark ? "Light" : "Dark"} Mode`}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              onClick={() => setNotificationsOpen((prev) => !prev)}
              className="p-2 rounded-xl text-content-muted hover:text-content-main hover:bg-surface-hover transition-colors relative"
              title="Observability Notifications"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
            </button>

            {notificationsOpen && (
              <>
                <div
                  onClick={() => setNotificationsOpen(false)}
                  className="fixed inset-0 z-30"
                />
                <div className="absolute right-0 mt-2 w-80 p-4 rounded-xl bg-surface-card border border-surface-border shadow-mat-hover z-40">
                  <div className="flex items-center justify-between pb-2 border-b border-surface-border">
                    <span className="font-semibold text-sm text-content-main">
                      Activity Log
                    </span>
                    <span className="text-[11px] text-primary font-medium">3 New</span>
                  </div>
                  <div className="mt-3 space-y-2.5 text-xs">
                    <div className="p-2.5 rounded-lg bg-surface-hover/70 flex items-start gap-2.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                      <div>
                        <p className="font-medium text-content-main">
                          Milestone M-3 Verified
                        </p>
                        <p className="text-content-muted text-[11px]">
                          Dialectical Critic accepted quantitative proof
                        </p>
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface-hover/70 flex items-start gap-2.5">
                      <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                      <div>
                        <p className="font-medium text-content-main">
                          Voyager Skill Compiled
                        </p>
                        <p className="text-content-muted text-[11px]">
                          Monte Carlo Risk sandbox execution verified in 142ms
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* User Profile Avatar */}
          <div className="relative pl-1">
            <button
              onClick={() => setUserDropdownOpen((prev) => !prev)}
              className="flex items-center gap-2 p-1 rounded-xl hover:bg-surface-hover transition-colors"
            >
              <div className="relative">
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary to-primary-hover flex items-center justify-center text-white font-bold text-xs shadow-xs">
                  {getInitials()}
                </div>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-surface-card" />
              </div>
            </button>

            {userDropdownOpen && (
              <>
                <div
                  onClick={() => setUserDropdownOpen(false)}
                  className="fixed inset-0 z-30"
                />
                <div className="absolute right-0 mt-2 w-64 p-3.5 rounded-2xl bg-surface-card border border-surface-border shadow-mat-hover z-40">
                  <div className="flex items-center gap-3 pb-3 border-b border-surface-border">
                    <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary font-bold flex items-center justify-center text-sm shrink-0">
                      {getInitials()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-xs text-content-main truncate">
                        {user?.full_name || "Platform Architect"}
                      </p>
                      <p className="text-[11px] text-content-muted truncate">
                        {user?.email || "admin@clever.ai"}
                      </p>
                      <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-primary/15 text-primary mt-1 inline-block">
                        {user?.role || "Admin"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 space-y-1 text-xs">
                    <Link
                      href="/settings"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center justify-between px-2.5 py-2 rounded-xl hover:bg-surface-hover text-content-main font-medium"
                    >
                      <div className="flex items-center gap-2">
                        <Settings className="w-3.5 h-3.5 text-content-muted" />
                        <span>Platform Settings</span>
                      </div>
                    </Link>

                    <a
                      href="https://app-912ec933-b93b-4612-b0f3-89d1351070b9.cleverapps.io/docs"
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between px-2.5 py-2 rounded-xl hover:bg-surface-hover text-content-main font-medium"
                    >
                      <div className="flex items-center gap-2">
                        <ExternalLink className="w-3.5 h-3.5 text-content-muted" />
                        <span>Swagger API Docs</span>
                      </div>
                    </a>

                    <button
                      onClick={() => {
                        setUserDropdownOpen(false);
                        logout();
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl hover:bg-rose-500/10 text-rose-500 font-semibold transition-colors mt-1 border-t border-surface-border pt-2"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
