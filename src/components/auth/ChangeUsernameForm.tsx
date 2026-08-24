"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormStatus, type SubmitState } from "@/components/admin/form-primitives";
import { useAuth } from "./AuthProvider";

// 修改用户名表单：新用户名。调 /api/auth/password... /username。
// 成功后刷新登录态（AuthProvider 的 user，驱动顶栏用户名）并 router.refresh()
// 让服务端渲染的"账号信息"区块也显示新名字。
export function ChangeUsernameForm() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [next, setNext] = useState("");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  const isSubmitting = state.kind === "submitting";

  useEffect(() => {
    if (state.kind !== "success") return;
    const timeout = window.setTimeout(() => setState({ kind: "idle" }), 1000);
    return () => window.clearTimeout(timeout);
  }, [state.kind]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    setState({ kind: "submitting" });

    let res: Response;
    try {
      res = await fetch("/api/auth/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newUsername: next.trim() }),
      });
    } catch {
      setState({ kind: "error", message: "网络请求失败，请检查服务是否在运行" });
      return;
    }

    let payload: { ok?: boolean; error?: string } = {};
    try {
      payload = (await res.json()) as typeof payload;
    } catch {
      // 非 JSON 响应，保留默认。
    }

    if (res.ok && payload.ok) {
      setState({ kind: "success", message: "用户名已更新" });
      setNext("");
      // 刷新登录态（顶栏）+ 服务端区块（账号信息）。
      await refresh();
      router.refresh();
    } else {
      const message = typeof payload.error === "string" ? payload.error : `请求失败（HTTP ${res.status}）`;
      setState({ kind: "error", message });
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-2">
        <Label htmlFor="cu-next">新用户名</Label>
        <Input
          id="cu-next"
          placeholder={user ? `当前：${user.username}` : "至少 1 位中文、字母、数字、下划线或连字符，最多 32 位"}
          autoComplete="username"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "提交中…" : "更新用户名"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}
