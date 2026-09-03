"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  Bot,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Cpu,
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login, loginAsDemo, isAuthenticated } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDemoSubmitting, setIsDemoSubmitting] = useState(false);

  // If already authenticated, redirect
  React.useEffect(() => {
    if (isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg("Please enter both email and password.");
      return;
    }
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setErrorMsg(err?.message || "Invalid email or password. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoLogin = async () => {
    setErrorMsg(null);
    setIsDemoSubmitting(true);
    try {
      await loginAsDemo();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to acquire demo session. Please try again.");
    } finally {
      setIsDemoSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-surface-bg">
      {/* Ambient background decoration */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 rounded-full bg-primary/10 blur-3xl pointer-events-none -z-10 animate-pulse" />
      <div className="absolute bottom-1/4 right-1/3 w-96 h-96 rounded-full bg-amber-500/10 blur-3xl pointer-events-none -z-10" />

      {/* Main Authentication Card */}
      <div className="w-full max-w-md rounded-3xl border border-surface-border bg-surface-card/90 backdrop-blur-2xl p-8 shadow-mat-hover relative z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-3 pb-6 border-b border-surface-border">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-primary via-primary-hover to-amber-500 text-white flex items-center justify-center shadow-mat-glow animate-float-slow">
            <Bot className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-xl font-extrabold text-content-main tracking-tight">
                Clever AI Team
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
                v1.0
              </span>
            </div>
            <p className="text-xs text-content-muted mt-1 leading-relaxed">
              Sign in to orchestrate autonomous multi-agent collectives
            </p>
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mt-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-start gap-2.5 animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="leading-relaxed">{errorMsg}</div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-xs">
          {/* Email */}
          <div className="space-y-1.5">
            <label className="font-semibold text-content-main block">Email Address</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-content-muted">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="architect@clever.ai"
                className="mat-input w-full pl-10 pr-3.5 py-2.5 text-xs font-medium"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-content-main block">Password</label>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-content-muted">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="mat-input w-full pl-10 pr-10 py-2.5 text-xs font-medium"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-content-muted hover:text-content-main"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || isDemoSubmitting}
            className="w-full mat-btn mat-btn-primary py-3 text-xs font-bold flex items-center justify-center gap-2 shadow-mat-glow hover:scale-101 active:scale-99 transition-all disabled:opacity-50 mt-2"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <span>Sign In to Studio</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-surface-border" />
          </div>
          <span className="relative px-3 bg-surface-card text-[11px] text-content-subtle uppercase tracking-wider font-semibold">
            Or One-Click Demo
          </span>
        </div>

        {/* Quick Demo Login */}
        <button
          onClick={handleDemoLogin}
          disabled={isSubmitting || isDemoSubmitting}
          className="w-full p-3 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-amber-500/5 to-surface-card hover:border-primary/60 hover:shadow-mat text-content-main transition-all flex items-center justify-center gap-2 font-semibold text-xs disabled:opacity-50 group"
        >
          {isDemoSubmitting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-primary" />
              <span>Provisioning Demo Token...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
              <span>Instant Sign-In as System Admin</span>
            </>
          )}
        </button>

        {/* Register Link */}
        <div className="mt-6 text-center text-xs text-content-muted">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-bold text-primary hover:underline ml-1 inline-flex items-center gap-1"
          >
            <span>Create an account</span>
          </Link>
        </div>

        {/* Platform Security Badge */}
        <div className="mt-6 pt-4 border-t border-surface-border/60 flex items-center justify-center gap-2 text-[10px] text-content-subtle font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>PostgreSQL JWT • Argon2/Bcrypt Security</span>
        </div>
      </div>
    </div>
  );
}
