"use client";

import { useEffect } from "react";
import { useAuth } from "./AuthProvider";

// 挂在"请先登录"的受限页（如 /me 未登录分支）上：探测完成后若仍未登录，自动弹出登录窗口。
// AuthProvider 根 layout 常驻，其首次自动弹窗只在整个应用首次挂载时触发一次
// （用户关掉后本次会话内不再自动弹）；故用户从别处导航进来、或在站内退出后落到本页时，
// 需由本组件再触发一次，兑现页面"登录窗口会自动弹出"的承诺。
export function AuthGatePrompt() {
  const { openAuth, user, loading } = useAuth();
  useEffect(() => {
    if (loading) return;
    if (!user) {
      openAuth("login");
    }
  }, [openAuth, user, loading]);
  return null;
}
