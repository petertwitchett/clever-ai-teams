"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  Bot,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const { register, isAuthenticated } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreeSafety, setAgreeSafety] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If already authenticated, redirect
  React.useEffect(() => {
    if (isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password) {
      setErrorMsg("Please fill in all required fields.");
      return;
    }

    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match. Please verify.");
      return;
    }

    if (!agreeSafety) {
      setErrorMsg("Please accept the constitutional AI safety agreement.");
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      await register(email.trim(), password, fullName.trim());
    } catch (err: any) {
      setErrorMsg(err?.message || "Registration failed. Please try a different email.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-surface-bg">
      {/* Ambient background decoration */}
      <div className="absolute top-1/4 right-1/3 w-96 h-96 rounded-full bg-primary/10 blur-3xl pointer-events-none -z-10 animate-pulse" />
      <div className="absolute bottom-1/4 left-1/3 w-96 h-96 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none -z-10" />

      {/* Main Registration Card */}
      <div className="w-full max-w-md rounded-3xl border border-surface-border bg-surface-card/90 backdrop-blur-2xl p-8 shadow-mat-hover relative z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-3 pb-6 border-b border-surface-border">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-primary via-primary-hover to-cyan-500 text-white flex items-center justify-center shadow-mat-glow animate-float-slow">
            <Bot className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-xl font-extrabold text-content-main tracking-tight">
                Create Your Account
              </h1>
            </div>
            <p className="text-xs text-content-muted mt-1 leading-relaxed">
              Join the Clever AI multi-agent visual orchestration studio
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
          {/* Full Name */}
          <div className="space-y-1.5">
            <label className="font-semibold text-content-main block">Full Name</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-content-muted">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Sofia Sterling"
                className="mat-input w-full pl-10 pr-3.5 py-2.5 text-xs font-medium"
              />
            </div>
          </div>

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
                placeholder="sofia@clever.ai"
                className="mat-input w-full pl-10 pr-3.5 py-2.5 text-xs font-medium"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="font-semibold text-content-main block">Password (min. 8 characters)</label>
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

          {/* Confirm Password */}
          <div className="space-y-1.5">
            <label className="font-semibold text-content-main block">Confirm Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-content-muted">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                className="mat-input w-full pl-10 pr-3.5 py-2.5 text-xs font-medium"
              />
            </div>
          </div>

          {/* Safety Agreement */}
          <div className="flex items-start gap-2 pt-1">
            <input
              type="checkbox"
              id="safety"
              checked={agreeSafety}
              onChange={(e) => setAgreeSafety(e.target.checked)}
              className="mt-0.5 rounded border-surface-border text-primary focus:ring-primary/20 cursor-pointer"
            />
            <label htmlFor="safety" className="text-[11px] text-content-muted leading-relaxed cursor-pointer select-none">
              I agree to adhere to constitutional AI safety invariants and responsible multi-agent orchestration.
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mat-btn mat-btn-primary py-3 text-xs font-bold flex items-center justify-center gap-2 shadow-mat-glow hover:scale-101 active:scale-99 transition-all disabled:opacity-50 mt-4"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Creating Account & Authenticating...</span>
              </>
            ) : (
              <>
                <span>Complete Registration</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Login Link */}
        <div className="mt-6 text-center text-xs text-content-muted">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-bold text-primary hover:underline ml-1 inline-flex items-center gap-1"
          >
            <span>Sign in</span>
          </Link>
        </div>

        {/* Platform Security Badge */}
        <div className="mt-6 pt-4 border-t border-surface-border/60 flex items-center justify-center gap-2 text-[10px] text-content-subtle font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>PostgreSQL Scalable Multi-Tenant Identity</span>
        </div>
      </div>
    </div>
  );
}
