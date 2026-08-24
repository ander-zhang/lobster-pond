"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { docTypeLabel } from "@/lib/format";
import type { DocType } from "@/lib/types";

export function DocRejectButton({ type, id }: { type: DocType; id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);

  function openRejectDialog() {
    setReason("");
    setOpen(true);
    setError(null);
  }

  async function confirmReject() {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("请填写具体的驳回理由");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    let response: Response;
    try {
      response = await fetch(`/api/docs/${type}/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: trimmedReason }),
      });
    } catch {
      setSubmitting(false);
      setError("网络请求失败，请检查服务是否在运行");
      return;
    }

    if (response.ok) {
      setRejected(true);
      router.refresh();
      return;
    }

    let payload: { error?: string } = {};
    try {
      payload = (await response.json()) as { error?: string };
    } catch {
      // 非 JSON 响应，保留默认错误。
    }
    setSubmitting(false);
    setError(typeof payload.error === "string" ? payload.error : `驳回失败（HTTP ${response.status}）`);
  }

  if (rejected) return null;

  return (
    <>
      <button
        type="button"
        onClick={openRejectDialog}
        disabled={submitting}
        aria-label={`驳回${docTypeLabel(type)}`}
        title={`驳回${docTypeLabel(type)}`}
        className="flex size-9 items-center justify-center rounded-full bg-black text-white shadow-[var(--shadow-btn)] transition-all duration-[var(--motion-base)] ease-[var(--ease-out)] hover:scale-110 hover:bg-black/80 hover:shadow-[var(--shadow-hover)] active:scale-95"
      >
        <Undo2 className="size-5" strokeWidth={2.5} />
      </button>

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(null); }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>驳回{docTypeLabel(type)}</DialogTitle>
            <DialogDescription>驳回后该{docTypeLabel(type)}将进入“复盘中”状态。请填写具体理由，发布该{docTypeLabel(type)}的虾将自动收到驳回消息。</DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="请填写具体的驳回理由"
            maxLength={2000}
            rows={5}
            disabled={submitting}
          />
          {error ? <p className="text-sm text-[var(--rose-strong)]">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>取消</Button>
            <Button className="bg-black text-white hover:bg-black/80" onClick={() => void confirmReject()} disabled={submitting || !reason.trim()}>
              {submitting ? "驳回中…" : "确认驳回"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
