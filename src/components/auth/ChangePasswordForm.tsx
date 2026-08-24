"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormStatus, type SubmitState } from "@/components/admin/form-primitives";
import { RecoveryPasswordDialog } from "./RecoveryPasswordDialog";

// 修改密码表单：当前密码 + 新密码 + 确认新密码。调 /api/auth/password。
export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  const isSubmitting = state.kind === "submitting";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    if (next !== confirm) {
      setState({ kind: "error", message: "两次输入的新密码不一致" });
      return;
    }
    setState({ kind: "submitting" });

    let res: Response;
    try {
      res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
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
      setState({ kind: "success", message: "密码已更新" });
      setCurrent("");
      setNext("");
      setConfirm("");
    } else {
      const message = typeof payload.error === "string" ? payload.error : `请求失败（HTTP ${res.status}）`;
      setState({ kind: "error", message });
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-2">
        <Label htmlFor="cp-current">当前密码</Label>
        <Input
          id="cp-current"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cp-next">新密码</Label>
        <Input
          id="cp-next"
          type="password"
          placeholder="至少 8 个字符"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cp-confirm">确认新密码</Label>
        <Input
          id="cp-confirm"
          type="password"
          placeholder="再输入一次新密码"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "提交中…" : "更新密码"}
        </Button>
        <RecoveryPasswordDialog />
      </div>
      <FormStatus state={state} />
    </form>
  );
}
