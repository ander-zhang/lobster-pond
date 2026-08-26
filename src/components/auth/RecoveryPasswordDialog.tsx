"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export function RecoveryPasswordDialog() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"key" | "password">("key");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  const isSubmitting = state.kind === "submitting";

  function resetDialog() {
    setStep("key");
    setRecoveryKey("");
    setNext("");
    setConfirm("");
    setState({ kind: "idle" });
  }

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) resetDialog();
  }

  async function readPayload(response: Response): Promise<{ ok?: boolean; error?: string }> {
    try {
      return (await response.json()) as { ok?: boolean; error?: string };
    } catch {
      return {};
    }
  }

  async function verifyKey(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (isSubmitting) return;
    setState({ kind: "submitting" });
    try {
      const response = await fetch("/api/auth/password/recovery/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recoveryKey }),
      });
      const payload = await readPayload(response);
      if (response.ok && payload.ok) {
        setRecoveryKey("");
        setStep("password");
        setState({ kind: "idle" });
        return;
      }
      setState({ kind: "error", message: payload.error ?? `请求失败（HTTP ${response.status}）` });
    } catch {
      setState({ kind: "error", message: "网络请求失败，请检查服务是否在运行" });
    }
  }

  async function resetPassword(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (isSubmitting) return;
    if (next !== confirm) {
      setState({ kind: "error", message: "两次输入的新密码不一致" });
      return;
    }
    setState({ kind: "submitting" });
    try {
      const response = await fetch("/api/auth/password/recovery/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: next, confirmPassword: confirm }),
      });
      const payload = await readPayload(response);
      if (response.ok && payload.ok) {
        await refresh();
        router.refresh();
        changeOpen(false);
        return;
      }
      setState({ kind: "error", message: payload.error ?? `请求失败（HTTP ${response.status}）` });
    } catch {
      setState({ kind: "error", message: "网络请求失败，请检查服务是否在运行" });
    }
  }

  return (
    <>
      <button
        type="button"
        className="text-xs text-[var(--accent-strong)] underline underline-offset-2 hover:no-underline"
        onClick={() => setOpen(true)}
      >
        忘记密码？
      </button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{step === "key" ? "验证恢复密钥" : "设置新密码"}</DialogTitle>
            <DialogDescription>
              {step === "key"
                ? "输入管理员提供的恢复密钥，重设当前登录账号的密码。"
                : "恢复密钥已验证，请设置当前账号的新密码。"}
            </DialogDescription>
          </DialogHeader>

          {step === "key" ? (
            <form className="space-y-4" onSubmit={verifyKey} noValidate>
              <div className="space-y-2">
                <Label htmlFor="recovery-key">恢复密钥</Label>
                <Input
                  id="recovery-key"
                  type="password"
                  autoComplete="off"
                  value={recoveryKey}
                  onChange={(event) => setRecoveryKey(event.target.value)}
                  required
                  autoFocus
                />
              </div>
              <Button className="w-full" type="submit" disabled={isSubmitting || !recoveryKey}>
                {isSubmitting ? "验证中…" : "验证密钥"}
              </Button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={resetPassword} noValidate>
              <div className="space-y-2">
                <Label htmlFor="recovery-next">新密码</Label>
                <Input id="recovery-next" type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} placeholder="至少 8 个字符" required autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recovery-confirm">确认新密码</Label>
                <Input id="recovery-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="再输入一次新密码" required />
              </div>
              <Button className="w-full" type="submit" disabled={isSubmitting || !next || !confirm}>
                {isSubmitting ? "重设中…" : "确认重设密码"}
              </Button>
            </form>
          )}
          <FormStatus state={state} />
        </DialogContent>
      </Dialog>
    </>
  );
}
