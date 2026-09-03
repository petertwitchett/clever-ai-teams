"use client";

import React, { useState, useEffect } from "react";
import { api } from "@/lib/api";
import {
  Settings,
  Server,
  Database,
  Shield,
  Key,
  ExternalLink,
  CheckCircle2,
  Cpu,
  Zap,
  Save,
  Activity,
} from "lucide-react";

export default function SettingsPage() {
  const [apiBaseUrl, setApiBaseUrl] = useState(api.getBaseUrl());
  const [authToken, setAuthToken] = useState(api.getToken() || "");
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [healthData, setHealthData] = useState<any>(null);

  useEffect(() => {
    async function check() {
      try {
        const h = await api.getHealth();
        setHealthData(h);
      } catch (err) {
        console.warn("Health probe error:", err);
      }
    }
    check();
  }, []);

  const handleSaveSettings = () => {
    api.setBaseUrl(apiBaseUrl);
    api.setToken(authToken.trim() || null);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="mat-card p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-bold text-lg text-content-main flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            Infrastructure & System Configuration
          </h2>
          <p className="text-xs text-content-muted mt-0.5">
            FastAPI High-Concurrency Gateway, Clever Cloud XL runtime, and Swagger API links
          </p>
        </div>

        <a
          href="https://app-912ec933-b93b-4612-b0f3-89d1351070b9.cleverapps.io/docs"
          target="_blank"
          rel="noreferrer"
          className="mat-btn mat-btn-primary text-xs font-semibold px-4 py-2.5 flex items-center gap-1.5 shadow-mat-glow"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Interactive Swagger UI (/docs)</span>
        </a>
      </div>

      {/* Grid: Infrastructure Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Multi-Core Uvicorn */}
        <div className="mat-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-content-main">Multi-Core Gateway</h3>
              <span className="text-[10px] text-emerald-500 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Gunicorn Master Active
              </span>
            </div>
          </div>
          <div className="text-xs text-content-muted space-y-1.5 pt-2 border-t border-surface-border">
            <div className="flex justify-between">
              <span>Logical CPU Cores:</span>
              <strong className="text-content-main">8 Cores (XL)</strong>
            </div>
            <div className="flex justify-between">
              <span>Uvicorn Workers:</span>
              <strong className="text-content-main">17 uvloop workers</strong>
            </div>
            <div className="flex justify-between">
              <span>Asynchronous Event Loop:</span>
              <strong className="text-primary font-mono">uvloop (Cython)</strong>
            </div>
          </div>
        </div>

        {/* Card 2: PostgreSQL & pgvector */}
        <div className="mat-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-content-main">PostgreSQL Checkpointer</h3>
              <span className="text-[10px] text-emerald-500 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Schema: clever_ai
              </span>
            </div>
          </div>
          <div className="text-xs text-content-muted space-y-1.5 pt-2 border-t border-surface-border">
            <div className="flex justify-between">
              <span>Connection Pool:</span>
              <strong className="text-content-main">Asyncpg (SQLAlchemy 2.0)</strong>
            </div>
            <div className="flex justify-between">
              <span>Vector Dimension:</span>
              <strong className="text-content-main">1536 (OpenAI Embeddings)</strong>
            </div>
            <div className="flex justify-between">
              <span>Index Type:</span>
              <strong className="text-primary font-mono">HNSW Cosine Ops</strong>
            </div>
          </div>
        </div>

        {/* Card 3: ARQ Distributed Queue */}
        <div className="mat-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center font-bold">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-content-main">Redis Cache Fabric</h3>
              <span className="text-[10px] text-emerald-500 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> In-Memory State
              </span>
            </div>
          </div>
          <div className="text-xs text-content-muted space-y-1.5 pt-2 border-t border-surface-border">
            <div className="flex justify-between">
              <span>Engine Version:</span>
              <strong className="text-content-main">Redis 8.10.1</strong>
            </div>
            <div className="flex justify-between">
              <span>Pub/Sub & Locking:</span>
              <strong className="text-emerald-500">Connected</strong>
            </div>
            <div className="flex justify-between">
              <span>Dialogue Buffers:</span>
              <strong className="text-content-main font-mono">cat:buffers:*</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Gateway & Authentication Form */}
      <div className="mat-card p-6 space-y-5">
        <h3 className="font-bold text-base text-content-main">
          API Gateway & Authentication Configuration
        </h3>

        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-content-muted font-semibold mb-1">
              Backend API Base URL
            </label>
            <input
              type="text"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              className="mat-input font-mono text-xs py-2.5"
            />
            <span className="text-[11px] text-content-muted mt-1 block">
              Default live endpoint:{" "}
              <code className="text-primary font-mono">
                https://app-912ec933-b93b-4612-b0f3-89d1351070b9.cleverapps.io/api/v1
              </code>
            </span>
          </div>

          <div>
            <label className="block text-content-muted font-semibold mb-1">
              JWT Bearer Token or API Key (Optional)
            </label>
            <input
              type="password"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              placeholder="Paste Bearer token from /api/v1/auth/login or personal API key..."
              className="mat-input font-mono text-xs py-2.5"
            />
          </div>

          <div className="pt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {savedSuccess && (
                <span className="text-xs text-emerald-500 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  Settings saved successfully!
                </span>
              )}
            </div>

            <button
              onClick={handleSaveSettings}
              className="mat-btn mat-btn-primary px-5 py-2.5 text-xs font-semibold flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Configuration</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
