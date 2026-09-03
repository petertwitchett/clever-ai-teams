"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "../theme/ThemeProvider";
import { AnimatedIcon, IconName } from "../icons/AnimatedIcon";
import { ChevronLeft, ChevronRight, Sparkles, Activity } from "lucide-react";

interface MenuItem {
  title: string;
  href: string;
  icon: IconName;
  badge?: string;
  badgeColor?: string;
}

interface MenuSection {
  heading: string;
  items: MenuItem[];
}

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, setSidebarCollapsed } = useTheme();

  const menuSections: MenuSection[] = [
    {
      heading: "MAIN SURFACES",
      items: [
        {
          title: "Team Overview",
          href: "/",
          icon: "dashboard",
        },
        {
          title: "Canvas Studio",
          href: "/canvas",
          icon: "canvas",
          badge: "VISUAL",
          badgeColor: "bg-primary/15 text-primary",
        },
        {
          title: "Consumer Chat",
          href: "/chat",
          icon: "chat",
          badge: "LIVE SSE",
          badgeColor: "bg-emerald-500/15 text-emerald-500",
        },
      ],
    },
    {
      heading: "PERSONAS & EVOLUTION",
      items: [
        {
          title: "Personas & Ethics",
          href: "/personas",
          icon: "personas",
        },
        {
          title: "Voyager Skills",
          href: "/skills",
          icon: "skills",
          badge: "SANDBOX",
          badgeColor: "bg-amber-500/15 text-amber-500",
        },
        {
          title: "Archival Memory",
          href: "/memory",
          icon: "memory",
        },
      ],
    },
    {
      heading: "INFRASTRUCTURE",
      items: [
        {
          title: "System & API Docs",
          href: "/settings",
          icon: "settings",
        },
      ],
    },
  ];

  return (
    <aside
      className={`fixed top-0 left-0 bottom-0 z-30 flex flex-col bg-surface-sidebar border-r border-surface-border transition-all duration-300 ${
        sidebarCollapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between h-18 px-4 border-b border-surface-border">
        <Link href="/" className="flex items-center gap-3 overflow-hidden">
          {/* Stylized Materialize M Logo */}
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-primary-hover flex items-center justify-center text-white font-black text-xl shadow-mat-glow shrink-0">
            <span className="tracking-tighter">M</span>
          </div>
          {!sidebarCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-base text-content-main tracking-tight truncate flex items-center gap-1.5">
                Clever AI Team
                <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
              </span>
              <span className="text-[11px] text-content-muted truncate font-medium">
                Multi-Agent Studio
              </span>
            </div>
          )}
        </Link>

        {/* Collapse Toggle */}
        <button
          onClick={() => setSidebarCollapsed((prev) => !prev)}
          className="p-1.5 rounded-lg text-content-muted hover:text-content-main hover:bg-surface-hover transition-colors hidden md:flex items-center justify-center"
          title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 py-4 px-3 overflow-y-auto space-y-6">
        {menuSections.map((section, idx) => (
          <div key={idx} className="space-y-1">
            {!sidebarCollapsed && (
              <div className="px-3 pb-1 text-[11px] font-bold tracking-wider text-content-subtle uppercase">
                {section.heading}
              </div>
            )}
            {section.items.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`mat-nav-pill ${isActive ? "active" : ""} ${
                    sidebarCollapsed ? "justify-center px-2" : ""
                  }`}
                  title={sidebarCollapsed ? item.title : undefined}
                >
                  <AnimatedIcon
                    name={item.icon}
                    size={19}
                    className={`nav-icon shrink-0 ${
                      isActive ? "text-white" : "text-content-muted"
                    }`}
                  />
                  {!sidebarCollapsed && (
                    <span className="truncate flex-1">{item.title}</span>
                  )}
                  {!sidebarCollapsed && item.badge && !isActive && (
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${item.badgeColor}`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Bottom Host Badge */}
      <div className="p-3 border-t border-surface-border">
        {!sidebarCollapsed ? (
          <div className="p-3 rounded-xl bg-surface-hover/70 border border-surface-border/60 flex items-center gap-3">
            <div className="relative w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0">
              <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-75" />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-semibold text-content-main truncate">
                Clever Cloud XL
              </span>
              <span className="text-[10px] text-content-muted truncate">
                8 Cores • 17 Uvicorn Workers
              </span>
            </div>
          </div>
        ) : (
          <div className="flex justify-center" title="Clever Cloud: 100% Operational">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        )}
      </div>
    </aside>
  );
}
