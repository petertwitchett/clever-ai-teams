"use client";

import React, { useState } from "react";
import {
  Plus,
  Crown,
  Play,
  CheckCircle,
  FileCode,
  LayoutGrid,
  Download,
  Upload,
  AlertCircle,
  Save,
  FolderOpen,
} from "lucide-react";

interface GraphToolbarProps {
  onAddOrchestrator: () => void;
  onAddPersonNode: (role?: string) => void;
  onValidate: () => void;
  onCompileAndSave: () => void;
  onOpenTemplates: () => void;
  onOpenDSLModal: () => void;
  isCompiling: boolean;
  validationStatus: { valid: boolean; message?: string } | null;
}

export function GraphToolbar({
  onAddOrchestrator,
  onAddPersonNode,
  onValidate,
  onCompileAndSave,
  onOpenTemplates,
  onOpenDSLModal,
  isCompiling,
  validationStatus,
}: GraphToolbarProps) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  return (
    <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-2 p-2 rounded-2xl bg-surface-card/90 border border-surface-border shadow-mat-hover backdrop-blur-md text-xs">
      {/* Add Entity Dropdown */}
      <div className="relative">
        <button
          onClick={() => setAddMenuOpen((prev) => !prev)}
          className="mat-btn mat-btn-primary px-3 py-1.5 flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Node</span>
        </button>

        {addMenuOpen && (
          <>
            <div
              onClick={() => setAddMenuOpen(false)}
              className="fixed inset-0 z-20"
            />
            <div className="absolute left-0 mt-2 w-52 p-2 rounded-xl bg-surface-card border border-surface-border shadow-mat-hover z-30 space-y-1">
              <button
                onClick={() => {
                  onAddOrchestrator();
                  setAddMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-surface-hover text-content-main font-semibold text-amber-500"
              >
                <Crown className="w-4 h-4" />
                <span>Orchestrator Node</span>
              </button>
              <div className="h-px bg-surface-border my-1" />
              <button
                onClick={() => {
                  onAddPersonNode("Senior Researcher");
                  setAddMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-surface-hover text-content-main font-medium"
              >
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                <span>Researcher Specialist</span>
              </button>
              <button
                onClick={() => {
                  onAddPersonNode("Analytical Critic");
                  setAddMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-surface-hover text-content-main font-medium"
              >
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span>Dialectical Critic</span>
              </button>
              <button
                onClick={() => {
                  onAddPersonNode("Quantitative Engineer");
                  setAddMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-surface-hover text-content-main font-medium"
              >
                <span className="w-2 h-2 rounded-full bg-cyan-500" />
                <span>Quant / Developer</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Templates */}
      <button
        onClick={onOpenTemplates}
        className="mat-btn mat-btn-outline px-3 py-1.5 flex items-center gap-1.5"
      >
        <FolderOpen className="w-3.5 h-3.5 text-primary" />
        <span>Templates</span>
      </button>

      {/* Validate */}
      <button
        onClick={onValidate}
        className="mat-btn mat-btn-outline px-3 py-1.5 flex items-center gap-1.5"
      >
        <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
        <span>Validate</span>
      </button>

      {/* Compile & Save */}
      <button
        onClick={onCompileAndSave}
        disabled={isCompiling}
        className="mat-btn bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 flex items-center gap-1.5 font-semibold shadow-xs"
      >
        <Save className="w-3.5 h-3.5" />
        <span>{isCompiling ? "Compiling..." : "Compile & Save"}</span>
      </button>

      {/* View JSON DSL */}
      <button
        onClick={onOpenDSLModal}
        className="mat-btn mat-btn-outline px-3 py-1.5 flex items-center gap-1.5"
      >
        <FileCode className="w-3.5 h-3.5 text-content-muted" />
        <span>JSON DSL</span>
      </button>

      {/* Validation Banner Indicator */}
      {validationStatus && (
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
            validationStatus.valid
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
              : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20"
          }`}
        >
          {validationStatus.valid ? (
            <CheckCircle className="w-3 h-3" />
          ) : (
            <AlertCircle className="w-3 h-3" />
          )}
          <span>{validationStatus.message || (validationStatus.valid ? "Graph Valid" : "Structural Error")}</span>
        </div>
      )}
    </div>
  );
}
