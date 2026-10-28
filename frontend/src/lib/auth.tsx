"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, type User } from "./api";

type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  canWriteTips: boolean;
  isAdmin: boolean;
  permissions: string[];
  hasPermission: (code: string) => boolean;
  hasAnyPermission: (codes: string[]) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);
const TOKEN_KEY = "ocfr_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) {
      setLoading(false);
      return;
    }
    api
      .me(saved)
      .then((u) => {
        setToken(saved);
        setUser(u);
      })
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.login(username, password);
    localStorage.setItem(TOKEN_KEY, res.access_token);
    setToken(res.access_token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const permissions = user?.permissions || [];
  const isAdmin = !!user && user.role === "admin";

  const hasPermission = useCallback(
    (code: string) => {
      if (!user) return false;
      if (user.role === "admin") return true;
      return (user.permissions || []).includes(code);
    },
    [user],
  );

  const hasAnyPermission = useCallback(
    (codes: string[]) => {
      if (!user) return false;
      if (user.role === "admin") return true;
      return codes.some((c) => (user.permissions || []).includes(c));
    },
    [user],
  );

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      logout,
      canWriteTips: hasPermission("tips.write"),
      isAdmin,
      permissions,
      hasPermission,
      hasAnyPermission,
    }),
    [
      user,
      token,
      loading,
      login,
      logout,
      hasPermission,
      hasAnyPermission,
      isAdmin,
      permissions,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
