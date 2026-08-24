"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormStatus, type SubmitState } from "@/components/admin/form-primitives";
import { useAuth } from "./AuthProvider";

type Mode = "login" | "register";

type AuthDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMode?: Mode;
};

// 登录 / 注册弹窗。两态切换共用一个 Dialog；成功后写入 AuthProvider 并关闭。
// 复用 form-primitives 的 FormStatus/SubmitState，与其余表单的反馈样式一致。
export function AuthDialog({ open, onOpenChange, defaultMode = "login" }: AuthDialogProps) {
  const { setUser } = useAuth();
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  const isSubmitting = state.kind === "submitting";

  // 弹窗每次打开时，把内部 mode 同步到调用方指定的 defaultMode。
  // 组件常驻挂载（用 open 控制显隐），useState 初始值只在首次取，不随 prop 更新，故需手动同步。
  useEffect(() => {
    if (open) {
      // 按 prop 重置内部态的合法场景，禁用 set-state-in-effect 规则。
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode(defaultMode);
      setState({ kind: "idle" });
    }
  }, [open, defaultMode]);

  function switchMode(next: Mode) {
    setMode(next);
    setState({ kind: "idle" });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    setState({ kind: "submitting" });

    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
    } catch {
      setState({ kind: "error", message: "网络请求失败，请检查服务是否在运行" });
      return;
    }

    let payload: { ok?: boolean; user?: { id: string; username: string; role: "member" | "admin" }; error?: string } = {};
    try {
      payload = (await res.json()) as typeof payload;
    } catch {
      // 非 JSON 响应，保留默认。
    }

    if (res.ok && payload.user) {
      setUser(payload.user);
      setState({ kind: "idle" });
      setUsername("");
      setPassword("");
      onOpenChange(false);
    } else {
      const message = typeof payload.error === "string" ? payload.error : `请求失败（HTTP ${res.status}）`;
      setState({ kind: "error", message });
    }
  }

  const isLogin = mode === "login";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isLogin ? "登录虾塘" : "注册账号"}</DialogTitle>
          <DialogDescription>
            {isLogin ? "登录后才能在问题帖下回复" : "用户名 + 密码即可注册，注册成功自动登录"}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="auth-username">用户名</Label>
            <Input
              id="auth-username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="auth-password">密码</Label>
            <Input
              id="auth-password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "提交中…" : isLogin ? "登录" : "注册"}
          </Button>
        </form>

        <FormStatus state={state} />

        <p className="text-center text-xs text-[var(--text-muted)]">
          {isLogin ? "还没有账号？" : "已有账号？"}
          <button
            type="button"
            onClick={() => switchMode(isLogin ? "register" : "login")}
            className="ml-1 underline hover:no-underline text-[var(--accent-strong)]"
          >
            {isLogin ? "去注册" : "去登录"}
          </button>
        </p>
      </DialogContent>
    </Dialog>
  );
}
