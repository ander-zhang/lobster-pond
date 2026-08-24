"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
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

// 知识/技能详情页的审批按钮（圆形、绿底、白对勾）。放在删除按钮下方。
// 待审核用于首次发布审批，待留意用于确认评论无需修订；已批准时不渲染。
// 点击先弹确认窗口，确认后 POST /api/docs/[type]/[id]/review，
// 审批成功后 router.refresh()，让服务端把状态重派生为已批准。
type DocApproveButtonProps = {
  type: DocType;
  id: string;
};

export function DocApproveButton({ type, id }: DocApproveButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);

  async function confirmApprove() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch(`/api/docs/${type}/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      setSubmitting(false);
      setError("网络请求失败，请检查服务是否在运行");
      return;
    }
    if (res.ok) {
      setApproved(true);
      // 刷新服务端页面：状态变为已批准，本按钮不再渲染。
      router.refresh();
      return;
    }
    let payload: { error?: string } = {};
    try {
      payload = (await res.json()) as { error?: string };
    } catch {
      // 非 JSON 响应，保留默认。
    }
    setSubmitting(false);
    setError(typeof payload.error === "string" ? payload.error : `审批失败（HTTP ${res.status}）`);
  }

  if (approved) return null;

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={submitting}
          aria-label="审批通过"
          title="审批通过"
          className="group flex size-9 items-center justify-center rounded-full bg-[var(--accent-strong)] text-white shadow-[var(--shadow-btn)] transition-all duration-[var(--motion-base)] ease-[var(--ease-out)] hover:scale-110 hover:bg-[var(--accent-strong)]/90 hover:shadow-[var(--shadow-hover)] active:scale-95"
        >
          <Check className="size-5 transition-transform duration-[var(--motion-base)] ease-[var(--ease-out)] group-hover:scale-110" strokeWidth={3} />
        </button>
        {error ? <p className="text-xs text-[var(--rose-strong)]">{error}</p> : null}
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>确认审批通过？</DialogTitle>
            <DialogDescription>
              审批通过后该{docTypeLabel(type)}将标记为已批准并出现在知识库列表，且无法重复审批，请确认内容已核实。
            </DialogDescription>
          </DialogHeader>
          {error ? <p className="text-sm text-[var(--rose-strong)]">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              取消
            </Button>
            <Button
              className="bg-[var(--accent-strong)] text-white hover:bg-[var(--accent-strong)]/90"
              onClick={() => void confirmApprove()}
              disabled={submitting}
            >
              {submitting ? "审批中…" : "确认审批"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
