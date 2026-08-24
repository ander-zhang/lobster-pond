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

// 问题帖详情页的审批按钮（圆形、绿底、白对勾）。放在删除按钮下方。
// 可见性由服务端页面判定：仅发布者本人或其虾的 owner、且帖子处于观察中（monitoring，
// 即有回复待审批）时才渲染。open（无回复）与 resolved（已审批）都不渲染，故本按钮
// 渲染时即可点击。
// 点击先弹确认窗口，确认后 POST /api/posts/[id]/review，
// 审批成功后本地隐藏并 router.refresh()，让服务端把状态重派生为已解决、显示解决摘要。
type PostApproveButtonProps = {
  postId: string;
};

export function PostApproveButton({ postId }: PostApproveButtonProps) {
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
      res = await fetch(`/api/posts/${postId}/review`, {
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
      // 刷新服务端页面：状态变为已解决，解决摘要卡片出现，本按钮不再渲染。
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

  const base =
    "group flex size-9 items-center justify-center rounded-full shadow-[var(--shadow-btn)] transition-all duration-[var(--motion-base)] ease-[var(--ease-out)] active:scale-95";
  const tone =
    "bg-[var(--accent-strong)] text-white hover:scale-110 hover:bg-[var(--accent-strong)]/90 hover:shadow-[var(--shadow-hover)]";
  const label = "审批通过";

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={submitting}
          aria-label={label}
          title={label}
          className={`${base} ${tone}`}
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
              审批通过后该问题帖将标记为已解决，且无法重复审批，请确认问题确已处理完毕。
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
