"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { User } from "@/lib/types";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  loginAsDemo: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();
  const pathname = usePathname();

  // Validate and load active user session
  const checkSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const storedToken = typeof window !== "undefined" ? localStorage.getItem("clever_ai_token") : null;
      if (!storedToken) {
        setUser(null);
        setToken(null);
        setIsLoading(false);
        return;
      }

      setToken(storedToken);
      api.setToken(storedToken);

      const profile = await api.getMe();
      setUser(profile);
      if (typeof window !== "undefined") {
        localStorage.setItem("clever_ai_user", JSON.stringify(profile));
      }
    } catch (err) {
      console.warn("Session check failed or expired:", err);
      api.logout();
      setUser(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Login handler
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.login(email, password);
      setToken(res.access_token);
      const profile = await api.getMe();
      setUser(profile);
      if (typeof window !== "undefined") {
        localStorage.setItem("clever_ai_user", JSON.stringify(profile));
      }
      router.push("/");
    } finally {
      setIsLoading(false);
    }
  };

  // Register handler
  const register = async (email: string, password: string, fullName: string) => {
    setIsLoading(true);
    try {
      await api.register(email, password, fullName);
      // Immediately login with newly created account
      const res = await api.login(email, password);
      setToken(res.access_token);
      const profile = await api.getMe();
      setUser(profile);
      if (typeof window !== "undefined") {
        localStorage.setItem("clever_ai_user", JSON.stringify(profile));
      }
      router.push("/");
    } finally {
      setIsLoading(false);
    }
  };

  // Quick Demo Admin Login
  const loginAsDemo = async () => {
    setIsLoading(true);
    try {
      const res = await api.getDemoToken();
      setToken(res.access_token);
      const profile = await api.getMe();
      setUser(profile);
      if (typeof window !== "undefined") {
        localStorage.setItem("clever_ai_user", JSON.stringify(profile));
      }
      router.push("/");
    } finally {
      setIsLoading(false);
    }
  };

  // Logout handler
  const logout = () => {
    api.logout();
    setUser(null);
    setToken(null);
    router.push("/login");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user && !!token,
        login,
        register,
        loginAsDemo,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
