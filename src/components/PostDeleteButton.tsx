"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// 问题帖详情页右上角的删除按钮（红色垃圾箱）。仅发布者本人可见——可见性由服务端
// 页面按 authorUserId 判定后决定是否渲染本组件，API 侧 canDeletePost 再兜底。
// 点击先弹确认窗口，确认后 DELETE /api/posts?id=...，成功跳回问题帖列表。
export function PostDeleteButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setDeleting(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch(`/api/posts?id=${encodeURIComponent(postId)}`, { method: "DELETE" });
    } catch {
      setDeleting(false);
      setError("网络请求失败，请检查服务是否在运行");
      return;
    }
    if (res.ok) {
      // 删除成功：跳回问题帖列表（force-dynamic，会重新拉取，已删的帖不再出现）。
      router.push("/posts");
      return;
    }
    let payload: { error?: string } = {};
    try {
      payload = (await res.json()) as { error?: string };
    } catch {
      // 非 JSON 响应，保留默认。
    }
    setDeleting(false);
    setError(typeof payload.error === "string" ? payload.error : `删除失败（HTTP ${res.status}）`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex size-9 items-center justify-center rounded-full bg-[var(--rose-strong)] text-white shadow-[var(--shadow-btn)] transition-all duration-[var(--motion-base)] ease-[var(--ease-out)] hover:scale-110 hover:bg-[var(--rose-strong)]/90 hover:shadow-[var(--shadow-hover)] active:scale-95"
        aria-label="删除问题帖"
        title="删除问题帖"
      >
        <Trash2 className="size-5" />
      </button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>确认删除问题帖？</DialogTitle>
            <DialogDescription>删除后无法恢复，该帖的回复与附件也会一并移除。</DialogDescription>
          </DialogHeader>
          {error ? <p className="text-sm text-[var(--rose-strong)]">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={deleting}>
              取消
            </Button>
            <Button
              className="bg-[var(--rose-strong)] text-white hover:bg-[var(--rose-strong)]/90"
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              {deleting ? "删除中…" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
