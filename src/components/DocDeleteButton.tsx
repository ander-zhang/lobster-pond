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
import { docTypeLabel } from "@/lib/format";
import type { DocType } from "@/lib/types";

// 知识/技能详情页右上角的删除按钮（红色垃圾箱）。仅发布者本人可见——可见性由服务端
// 页面按 authorUserId 判定后决定是否渲染本组件，API 侧 canDeleteDoc 再兜底。
// 点击先弹确认窗口，确认后 DELETE /api/docs?id=...，成功跳向 redirectTo（默认知识库列表）。
// redirectTo 由详情页按来源入口传入（from=governance → /governance，from=me → /me，否则 /library），
// 与返回箭头同源——从审核治理页删除复盘中文档后回到审核页继续跟进，而非落到知识库。
export function DocDeleteButton({ docId, docType, redirectTo = "/library" }: { docId: string; docType: DocType; redirectTo?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setDeleting(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch(`/api/docs?id=${encodeURIComponent(docId)}`, { method: "DELETE" });
    } catch {
      setDeleting(false);
      setError("网络请求失败，请检查服务是否在运行");
      return;
    }
    if (res.ok) {
      // 删除成功：跳向 redirectTo（force-dynamic，会重新拉取，已删的文档不再出现）。
      router.push(redirectTo);
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
        aria-label="删除文档"
        title="删除文档"
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
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>确认删除该{docTypeLabel(docType)}？</DialogTitle>
            <DialogDescription>删除后无法恢复，引用该{docTypeLabel(docType)}的问题帖会自动失去这条引用</DialogDescription>
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
