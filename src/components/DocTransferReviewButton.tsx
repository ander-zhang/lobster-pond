"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, UserRoundPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { docTypeLabel } from "@/lib/format";
import type { DocType } from "@/lib/types";

type UserOption = { id: string; username: string };

// 转审按钮：岗位虾的 owner 把待审核文档的审批权（批准 / 驳回）转交给其他注册用户。
// 位于驳回按钮左侧；点击弹窗列出全部注册用户（不含自己），选择后确认转交。
// 转交成功后 owner 失去该文档审批权（驳回 / 审批按钮随 router.refresh 消失），
// 被转审人收到页眉铃铛提醒并接手审批。
export function DocTransferReviewButton({ type, id, currentUserId }: { type: DocType; id: string; currentUserId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<UserOption[] | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferred, setTransferred] = useState(false);

  useEffect(() => {
    if (!open || users !== null) return;
    let cancelled = false;
    fetch("/api/users", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = (await response.json()) as { ok: boolean; users: UserOption[] };
        if (!cancelled) {
          // 名单不含自己：审批权转交给自己没有意义（服务层同样拒绝）。
          setUsers(payload.users.filter((user) => user.id !== currentUserId));
        }
      })
      .catch(() => {
        if (!cancelled) setError("用户名单加载失败，请稍后重试");
      });
    return () => {
      cancelled = true;
    };
  }, [open, users, currentUserId]);

  // 搜索过滤：按用户名子串（忽略大小写）精准定位转审目标。
  const filteredUsers = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!users || !keyword) return users;
    return users.filter((user) => user.username.toLowerCase().includes(keyword));
  }, [users, query]);

  async function confirmTransfer() {
    if (!selectedUserId || submitting) return;
    setSubmitting(true);
    setError(null);

    let response: Response;
    try {
      response = await fetch(`/api/docs/${type}/${id}/transfer-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId }),
      });
    } catch {
      setSubmitting(false);
      setError("网络请求失败，请检查服务是否在运行");
      return;
    }

    if (response.ok) {
      setTransferred(true);
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
    setError(typeof payload.error === "string" ? payload.error : `转审失败（HTTP ${response.status}）`);
  }

  if (transferred) return null;

  return (
    <>
      {/* 虾的语义色（玫瑰）：转审是岗位虾内容的治理动作，与 /me 页虾圆形按钮同款。 */}
      <button
        type="button"
        onClick={() => { setSelectedUserId(null); setQuery(""); setError(null); setOpen(true); }}
        disabled={submitting}
        aria-label="转审"
        title="转审：把审批权转交给其他用户"
        className="flex size-9 items-center justify-center rounded-full bg-[var(--rose)] text-white shadow-[var(--shadow-btn)] transition-all duration-[var(--motion-base)] ease-[var(--ease-out)] hover:scale-110 hover:bg-[var(--rose)]/90 hover:shadow-[var(--shadow-hover)] active:scale-95"
      >
        <UserRoundPlus className="size-5" strokeWidth={2.5} />
      </button>

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(null); }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>转审{docTypeLabel(type)}</DialogTitle>
          </DialogHeader>
          {/* 搜索框：用户名子串过滤，精准定位期望的转审目标。 */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索用户名…"
              aria-label="搜索用户名"
              disabled={submitting || users === null}
              className="w-full rounded-lg border border-[var(--hairline)] bg-white py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent-strong)]"
            />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--hairline)]">
            {users === null && !error ? (
              <p className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">正在加载用户名单...</p>
            ) : null}
            {error && users === null ? (
              <p className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">用户名单加载失败</p>
            ) : null}
            {users?.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">暂无其他注册用户</p>
            ) : null}
            {filteredUsers?.length === 0 && query.trim() ? (
              <p className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">没有匹配「{query.trim()}」的用户</p>
            ) : null}
            {filteredUsers?.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => setSelectedUserId(user.id)}
                disabled={submitting}
                className={`flex w-full items-center gap-3 border-b border-[var(--hairline)] px-3 py-2.5 text-left text-sm transition-colors last:border-b-0 hover:bg-[var(--surface-2)] ${selectedUserId === user.id ? "bg-[var(--surface-2)] font-semibold text-[var(--accent-strong)]" : "text-[var(--text-primary)]"}`}
              >
                <span className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${selectedUserId === user.id ? "border-[var(--accent-strong)]" : "border-[var(--hairline)]"}`}>
                  {selectedUserId === user.id ? <span className="size-2 rounded-full bg-[var(--accent-strong)]" /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate">{user.username}</span>
              </button>
            ))}
          </div>
          {error && users !== null ? <p className="text-sm text-[var(--rose-strong)]">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>取消</Button>
            <Button
              className="bg-[var(--rose)] text-white hover:bg-[var(--rose)]/90"
              onClick={() => void confirmTransfer()}
              disabled={submitting || !selectedUserId}
            >
              {submitting ? "转审中…" : "确认转审"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
