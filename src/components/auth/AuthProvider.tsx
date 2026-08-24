"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthDialog } from "./AuthDialog";

export type AuthUser = { id: string; username: string; role: "member" | "admin" };
type AuthMode = "login" | "register";

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<AuthUser | null>;
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
  openAuth: (mode?: AuthMode) => void;
};

const AuthContext = createContext<AuthState | null>(null);

// 全站登录态。挂载时探测 /api/auth/me：
//   - 已登录 → 写入 user；
//   - 未登录（首次访问或会话失效）→ 自动弹出登录窗口一次。
// 弹窗开关收归于此（AuthProvider 在根 layout 常驻，跨页面导航不重挂），
// 故用户关掉后本次会话内不再自动弹；刷新/重开则重新探测并按需再弹。
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<AuthMode>("login");
  // 防止开发期 StrictEffect 双调用导致重复弹窗/重复探测。
  const didInitRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const payload = (await res.json()) as { user: AuthUser | null };
      setUserState(payload.user ?? null);
      return payload.user ?? null;
    } catch {
      setUserState(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    // 首次探测登录态：未登录则自动弹登录窗口（与外部会话系统同步的合法副作用）。
    void refresh().then((u) => {
      if (!u) {
        setDialogMode("login");
        setDialogOpen(true);
      }
    });
  }, [refresh]);

  const setUser = useCallback((next: AuthUser | null) => {
    setUserState(next);
    if (next) {
      setDialogOpen(false);
      // 登录态变更后刷新当前路由的服务端组件：/me 等依赖会话 cookie 的页面
      // 才会从"请先登录"重派生为账号信息，免去手动刷新。
      router.refresh();
    }
  }, [router]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // 即便请求失败也清掉本地态，避免界面卡在"已登录"。
    }
    setUserState(null);
    // 退出后 cookie 已清：刷新让 /me 等页面的服务端组件重派生为未登录视图，
    // 否则页面正文仍停留在退出前的账号信息，与顶栏登录态不一致。
    router.refresh();
  }, [router]);

  const openAuth = useCallback((mode: AuthMode = "login") => {
    setDialogMode(mode);
    setDialogOpen(true);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, setUser, logout, openAuth }}>
      {children}
      <AuthDialog
        open={dialogOpen}
        onOpenChange={(open) => setDialogOpen(open)}
        defaultMode={dialogMode}
      />
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
