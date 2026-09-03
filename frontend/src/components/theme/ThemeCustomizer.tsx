"use client";

import React, { useState } from "react";
import { useTheme } from "./ThemeProvider";
import { ThemeColor } from "@/lib/types";
import { Settings, X, Check, Sun, Moon } from "lucide-react";

export function ThemeCustomizer() {
  const [isOpen, setIsOpen] = useState(false);
  const { themeMode, setThemeMode, themeColor, setThemeColor, isDark } = useTheme();

  const colors: { id: ThemeColor; name: string; hex: string }[] = [
    { id: "purple", name: "Materialize Purple", hex: "#7367F0" },
    { id: "orange", name: "Sunset Orange", hex: "#FF9F43" },
    { id: "blue", name: "Electric Cyan", hex: "#00CFDD" },
    { id: "green", name: "Mint Emerald", hex: "#28C76F" },
    { id: "red", name: "Coral Crimson", hex: "#EA5455" },
  ];

  return (
    <>
      {/* Floating Gear Trigger */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-primary text-white p-2.5 rounded-l-xl shadow-mat-glow transition-all duration-300 hover:pr-3.5 group"
        title="Customize Theme & Colors"
      >
        <Settings className="w-5 h-5 animate-spin-slow group-hover:rotate-180 transition-transform duration-700" />
      </button>

      {/* Slide-out Backdrop */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity"
        />
      )}

      {/* Customizer Slide-out Drawer */}
      <div
        className={`fixed right-0 top-0 bottom-0 w-80 z-50 bg-surface-card border-l border-surface-border shadow-2xl transition-transform duration-300 ease-in-out p-6 overflow-y-auto ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between pb-4 border-b border-surface-border">
          <div>
            <h3 className="font-semibold text-lg text-content-main">Theme Customizer</h3>
            <p className="text-xs text-content-muted">Customize UI mode and accent colors</p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg hover:bg-surface-hover text-content-muted hover:text-content-main"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Theme Mode */}
        <div className="mt-6">
          <label className="text-xs font-bold uppercase tracking-wider text-content-muted block mb-3">
            Interface Theme
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setThemeMode("light")}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all ${
                themeMode === "light"
                  ? "border-primary bg-primary/10 text-primary shadow-xs"
                  : "border-surface-border hover:bg-surface-hover text-content-main"
              }`}
            >
              <Sun className="w-4 h-4" />
              <span>Light</span>
            </button>
            <button
              onClick={() => setThemeMode("dark")}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all ${
                themeMode === "dark"
                  ? "border-primary bg-primary/10 text-primary shadow-xs"
                  : "border-surface-border hover:bg-surface-hover text-content-main"
              }`}
            >
              <Moon className="w-4 h-4" />
              <span>Dark</span>
            </button>
          </div>
        </div>

        {/* 5 Accent Colors */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-bold uppercase tracking-wider text-content-muted">
              Accent Color (5 Palettes)
            </label>
            <span className="text-xs font-semibold text-primary capitalize">{themeColor}</span>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {colors.map((c) => (
              <button
                key={c.id}
                onClick={() => setThemeColor(c.id)}
                className="group relative flex flex-col items-center gap-1.5 p-2 rounded-xl border border-surface-border hover:border-primary/50 transition-all"
                title={c.name}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white shadow-xs transition-transform group-hover:scale-110"
                  style={{ backgroundColor: c.hex }}
                >
                  {themeColor === c.id && <Check className="w-4 h-4 stroke-[3]" />}
                </div>
                <span className="text-[10px] text-content-muted group-hover:text-content-main capitalize">
                  {c.id}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Theme Information */}
        <div className="mt-8 p-4 rounded-xl bg-surface-hover/70 border border-surface-border text-xs space-y-2">
          <p className="font-medium text-content-main">Materialize Design System</p>
          <p className="text-content-muted leading-relaxed">
            All cards, charts, active navigation pills, and glowing node borders dynamically adapt
            to your selected accent color.
          </p>
        </div>
      </div>
    </>
  );
}
