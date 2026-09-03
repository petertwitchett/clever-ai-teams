"use client";

import React, { useState } from "react";
import { useTheme } from "../theme/ThemeProvider";
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
              className="w-full pl-9 pr-14 py-1.5 text-sm bg-transparent border border-transparent hover:border-surface-border focus:border-primary/50 rounded-lg text-content-main placeholder:text-content-subtle outline-none transition-all"
            />
            <kbd className="absolute right-3 hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono text-content-subtle bg-surface-hover rounded border border-surface-border">
              CTRL K
            </kbd>
          </div>
        </div>

        {/* Right Action Icons */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Live Status Pill */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Clever Cloud: Healthy</span>
          </div>

          {/* 5 Accent Colors Dropdown */}
          <div className="relative">
            <button
              onClick={() => setColorPickerOpen((prev) => !prev)}
              className="p-2 rounded-lg text-content-muted hover:text-content-main hover:bg-surface-hover transition-colors relative"
              title="Theme Color Palette"
            >
              <Palette className="w-5 h-5 text-primary" />
            </button>

            {colorPickerOpen && (
              <>
                <div
                  onClick={() => setColorPickerOpen(false)}
                  className="fixed inset-0 z-30"
                />
                <div className="absolute right-0 mt-2 w-48 p-3 rounded-xl bg-surface-card border border-surface-border shadow-mat-hover z-40">
                  <div className="text-[11px] font-bold text-content-muted uppercase tracking-wider mb-2">
                    Primary Accent
                  </div>
                  <div className="space-y-1.5">
                    {colors.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setThemeColor(c.id);
                          setColorPickerOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          themeColor === c.id
                            ? "bg-primary/10 text-primary font-semibold"
                            : "hover:bg-surface-hover text-content-main"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3.5 h-3.5 rounded-full"
                            style={{ backgroundColor: c.hex }}
                          />
                          <span>{c.name}</span>
                        </div>
                        {themeColor === c.id && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Light / Dark Mode Switcher */}
          <button
            onClick={() => setThemeMode(isDark ? "light" : "dark")}
            className="p-2 rounded-lg text-content-muted hover:text-content-main hover:bg-surface-hover transition-colors"
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDark ? (
              <Sun className="w-5 h-5 text-amber-400 hover:rotate-90 transition-transform duration-300" />
            ) : (
              <Moon className="w-5 h-5 text-content-muted hover:-rotate-12 transition-transform duration-300" />
            )}
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setNotificationsOpen((prev) => !prev)}
              className="p-2 rounded-lg text-content-muted hover:text-content-main hover:bg-surface-hover transition-colors relative"
              title="Notifications"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500" />
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
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary to-primary-hover flex items-center justify-center text-white font-bold text-sm shadow-xs">
                  SA
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
                <div className="absolute right-0 mt-2 w-56 p-3 rounded-xl bg-surface-card border border-surface-border shadow-mat-hover z-40">
                  <div className="flex items-center gap-3 pb-3 border-b border-surface-border">
                    <div className="w-10 h-10 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-sm">
                      SA
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-content-main truncate">
                        Admin User
                      </p>
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        System Admin
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 space-y-1 text-xs">
                    <a
                      href="https://app-912ec933-b93b-4612-b0f3-89d1351070b9.cleverapps.io/docs"
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-surface-hover text-content-main"
                    >
                      <span>Swagger API Docs</span>
                      <ExternalLink className="w-3.5 h-3.5 text-content-muted" />
                    </a>
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
