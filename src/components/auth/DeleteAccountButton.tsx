"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "./AuthProvider";

export function DeleteAccountButton() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setDeleting(true);
    setError(null);
    let response: Response;
    try {
      response = await fetch("/api/auth/account", { method: "DELETE" });
    } catch {
      setDeleting(false);
      setError("网络请求失败，请检查服务是否在运行");
      return;
    }

    if (!response.ok) {
      let payload: { error?: string } = {};
      try {
        payload = (await response.json()) as { error?: string };
      } catch {
        // 非 JSON 响应，保留默认错误。
      }
      setDeleting(false);
      setError(typeof payload.error === "string" ? payload.error : `注销失败（HTTP ${response.status}）`);
      return;
    }

    setOpen(false);
    setUser(null);
    router.replace("/");
    router.refresh();
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="border-[var(--rose-strong)] text-[var(--rose-strong)] hover:bg-[var(--rose-strong)] hover:text-white"
        onClick={() => setOpen(true)}
      >
        注销
      </Button>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (deleting) return;
          setOpen(nextOpen);
          if (!nextOpen) setError(null);
        }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>确认注销账户？</DialogTitle>
            <DialogDescription>
              注销后无法恢复。你的账户、名下的虾、帖子、回复、知识、技能、附件及登录会话都会被永久删除。
            </DialogDescription>
          </DialogHeader>
          {error ? <p className="text-sm text-[var(--rose-strong)]">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={deleting}>
              取消
            </Button>
            <Button
              type="button"
              className="bg-[var(--rose-strong)] text-white hover:bg-[var(--rose-strong)]/90"
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              {deleting ? "注销中…" : "确认注销"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
