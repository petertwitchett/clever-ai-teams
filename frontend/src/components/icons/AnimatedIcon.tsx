"use client";

import React, { useState } from "react";
import * as LucideIcons from "lucide-react";
import * as LucideAnimated from "lucide-animated";

export type IconName =
  | "dashboard"
  | "canvas"
  | "chat"
  | "personas"
  | "skills"
  | "memory"
  | "settings"
  | "search"
  | "sun"
  | "moon"
  | "palette"
  | "bell"
  | "orchestrator"
  | "specialist"
  | "critic"
  | "developer"
  | "researcher"
  | "shield"
  | "play"
  | "refresh"
  | "check"
  | "clock"
  | "alert"
  | "sparkles"
  | "cpu"
  | "database"
  | "terminal"
  | "plus"
  | "chevronRight"
  | "chevronDown"
  | "filter"
  | "maximize"
  | "download"
  | "externalLink"
  | "zap";

interface AnimatedIconProps {
  name: IconName;
  size?: number;
  className?: string;
  animateOnHover?: boolean;
}

export function AnimatedIcon({
  name,
  size = 20,
  className = "",
  animateOnHover = true,
}: AnimatedIconProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Render meaningful animated components
  switch (name) {
    case "dashboard":
      return (
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`inline-flex items-center justify-center transition-transform duration-200 ${
            isHovered && animateOnHover ? "scale-110 rotate-3" : ""
          } ${className}`}
        >
          <LucideIcons.LayoutDashboard size={size} />
        </div>
      );

    case "canvas":
      return (
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`inline-flex items-center justify-center transition-transform duration-300 ${
            isHovered && animateOnHover ? "scale-115 text-primary" : ""
          } ${className}`}
        >
          <LucideIcons.Workflow size={size} />
        </div>
      );

    case "chat":
      return (
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`inline-flex items-center justify-center transition-transform duration-200 ${
            isHovered && animateOnHover ? "scale-110 -translate-y-0.5" : ""
          } ${className}`}
        >
          <LucideIcons.Bot size={size} />
        </div>
      );

    case "personas":
      return (
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`inline-flex items-center justify-center transition-transform duration-200 ${
            isHovered && animateOnHover ? "scale-115 text-primary" : ""
          } ${className}`}
        >
          <LucideIcons.Brain size={size} />
        </div>
      );

    case "skills":
      return (
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`inline-flex items-center justify-center transition-transform duration-200 ${
            isHovered && animateOnHover ? "scale-115 rotate-12 text-amber-500" : ""
          } ${className}`}
        >
          <LucideIcons.Cpu size={size} />
        </div>
      );

    case "memory":
      return (
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`inline-flex items-center justify-center transition-transform duration-200 ${
            isHovered && animateOnHover ? "scale-110" : ""
          } ${className}`}
        >
          <LucideIcons.Database size={size} />
        </div>
      );

    case "settings":
      return (
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`inline-flex items-center justify-center transition-transform duration-500 ${
            isHovered && animateOnHover ? "rotate-90 scale-110" : ""
          } ${className}`}
        >
          <LucideIcons.Settings size={size} />
        </div>
      );

    case "shield":
      return (
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`inline-flex items-center justify-center transition-transform duration-200 ${
            isHovered && animateOnHover ? "scale-115 text-emerald-500" : ""
          } ${className}`}
        >
          <LucideIcons.ShieldCheck size={size} />
        </div>
      );

    case "sparkles":
      return (
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`inline-flex items-center justify-center transition-all duration-300 ${
            isHovered && animateOnHover ? "scale-125 rotate-12 text-yellow-500" : ""
          } ${className}`}
        >
          <LucideIcons.Sparkles size={size} />
        </div>
      );

    case "orchestrator":
      return (
        <div className={`inline-flex items-center justify-center ${className}`}>
          <LucideIcons.Crown size={size} className="text-amber-500" />
        </div>
      );

    case "specialist":
      return (
        <div className={`inline-flex items-center justify-center ${className}`}>
          <LucideIcons.Lightbulb size={size} className="text-primary" />
        </div>
      );

    case "critic":
      return (
        <div className={`inline-flex items-center justify-center ${className}`}>
          <LucideIcons.Scale size={size} className="text-rose-500" />
        </div>
      );

    case "developer":
      return (
        <div className={`inline-flex items-center justify-center ${className}`}>
          <LucideIcons.Code2 size={size} className="text-cyan-500" />
        </div>
      );

    case "researcher":
      return (
        <div className={`inline-flex items-center justify-center ${className}`}>
          <LucideIcons.SearchCheck size={size} className="text-indigo-500" />
        </div>
      );

    case "play":
      return <LucideIcons.Play size={size} className={className} />;
    case "refresh":
      return (
        <LucideIcons.RefreshCw
          size={size}
          className={`transition-transform duration-500 ${isHovered ? "rotate-180" : ""} ${className}`}
        />
      );
    case "check":
      return <LucideIcons.CheckCircle2 size={size} className={`text-emerald-500 ${className}`} />;
    case "clock":
      return <LucideIcons.Clock size={size} className={className} />;
    case "alert":
      return <LucideIcons.AlertTriangle size={size} className={`text-amber-500 ${className}`} />;
    case "bell":
      return (
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`inline-flex items-center justify-center transition-transform ${
            isHovered ? "rotate-12 scale-110" : ""
          } ${className}`}
        >
          <LucideIcons.Bell size={size} />
        </div>
      );
    case "sun":
      return <LucideIcons.Sun size={size} className={className} />;
    case "moon":
      return <LucideIcons.Moon size={size} className={className} />;
    case "palette":
      return <LucideIcons.Palette size={size} className={className} />;
    case "search":
      return <LucideIcons.Search size={size} className={className} />;
    case "terminal":
      return <LucideIcons.Terminal size={size} className={className} />;
    case "plus":
      return <LucideIcons.Plus size={size} className={className} />;
    case "chevronRight":
      return <LucideIcons.ChevronRight size={size} className={className} />;
    case "chevronDown":
      return <LucideIcons.ChevronDown size={size} className={className} />;
    case "filter":
      return <LucideIcons.Filter size={size} className={className} />;
    case "maximize":
      return <LucideIcons.Maximize2 size={size} className={className} />;
    case "download":
      return <LucideIcons.Download size={size} className={className} />;
    case "externalLink":
      return <LucideIcons.ExternalLink size={size} className={className} />;
    case "zap":
      return <LucideIcons.Zap size={size} className={`text-amber-500 ${className}`} />;
    default:
      return <LucideIcons.Sparkles size={size} className={className} />;
  }
}
