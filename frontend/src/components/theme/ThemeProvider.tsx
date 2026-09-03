"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { ThemeMode, ThemeColor } from "@/lib/types";

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  themeColor: ThemeColor;
  setThemeColor: (color: ThemeColor) => void;
  isDark: boolean;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>("light");
  const [themeColor, setThemeColorState] = useState<ThemeColor>("purple");
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedMode = localStorage.getItem("clever_theme_mode") as ThemeMode | null;
    const savedColor = localStorage.getItem("clever_theme_color") as ThemeColor | null;

    if (savedMode) setThemeModeState(savedMode);
    if (savedColor) setThemeColorState(savedColor);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;

    // Mode
    if (themeMode === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    // Color
    root.setAttribute("data-theme-color", themeColor);

    localStorage.setItem("clever_theme_mode", themeMode);
    localStorage.setItem("clever_theme_color", themeColor);
  }, [themeMode, themeColor, mounted]);

  const setThemeMode = (mode: ThemeMode) => setThemeModeState(mode);
  const setThemeColor = (color: ThemeColor) => setThemeColorState(color);

  const isDark = themeMode === "dark";

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        setThemeMode,
        themeColor,
        setThemeColor,
        isDark,
        sidebarCollapsed,
        setSidebarCollapsed,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
