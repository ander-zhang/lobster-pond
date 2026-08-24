"use client";

import { Bell, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SiteNotification } from "@/lib/types";

type NotificationPayload = {
  ok: boolean;
  notifications: SiteNotification[];
  unreadCount: number;
};

export function NotificationPopover({ userId }: { userId: string }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<SiteNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const loadingRef = useRef(false);

  const loadNotifications = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as NotificationPayload;
      setNotifications(payload.notifications);
      setUnreadCount(payload.unreadCount);
      setLoaded(true);
    } catch {
      // 顶栏提醒加载失败时保持静默，不影响站点其他功能。
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadNotifications(), 0);
    let events: EventSource | null = null;

    if (typeof EventSource !== "undefined") {
      events = new EventSource("/api/notifications/stream");
      events.addEventListener("notifications", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as NotificationPayload;
          setNotifications(payload.notifications);
          setUnreadCount(payload.unreadCount);
          setLoaded(true);
        } catch {
          // 忽略格式异常的单条 SSE，保持连接等待下一次服务端推送。
        }
      });
    }

    return () => {
      window.clearTimeout(initial);
      events?.close();
    };
  }, [loadNotifications, userId]);

  async function openNotification(notification: SiteNotification) {
    await ignoreNotification(notification.id);
    if (notification.targetType === "post") {
      router.push(`/posts/${notification.postId}#reply-${notification.replyId}`);
    } else if (notification.kind === "review_transfer") {
      // 转审提醒：跳到文档详情页（无评论锚点），被转审人在该页接手批准 / 驳回。
      router.push(`/library/${notification.docType}/${notification.docId}`);
    } else {
      router.push(`/library/${notification.docType}/${notification.docId}#comment-${notification.commentId}`);
    }
  }

  async function ignoreNotification(notificationId: string) {
    const previous = notifications;
    const ignored = notifications.find((item) => item.id === notificationId);
    setNotifications((items) => items.filter((item) => item.id !== notificationId));
    if (ignored && !ignored.readAt) setUnreadCount((count) => Math.max(0, count - 1));

    try {
      const response = await fetch(`/api/notifications/${notificationId}`, { method: "DELETE" });
      if (!response.ok) {
        setNotifications(previous);
        if (ignored && !ignored.readAt) setUnreadCount((count) => count + 1);
      }
    } catch {
      setNotifications(previous);
      if (ignored && !ignored.readAt) setUnreadCount((count) => count + 1);
    }
  }

  async function markAllRead() {
    const now = new Date().toISOString();
    setNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt ?? now })));
    setUnreadCount(0);
    try {
      const response = await fetch("/api/notifications", { method: "PATCH" });
      if (!response.ok) void loadNotifications();
    } catch {
      void loadNotifications();
    }
  }

  return (
    <Popover onOpenChange={(open) => { if (open) void loadNotifications(); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex size-9 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
          aria-label={unreadCount > 0 ? `消息提醒，${unreadCount} 条未读` : "消息提醒"}
          title="消息提醒"
        >
          <Bell className="size-[18px]" aria-hidden="true" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1.5 -top-1 flex min-w-5 items-center justify-center rounded-full bg-[var(--rose-strong)] px-1 text-[0.65rem] font-semibold leading-5 text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="w-[min(22rem,calc(100vw-2rem))] p-1">
        <div className="flex items-center justify-between gap-4 px-3 py-2">
          <p className="text-sm font-semibold leading-5 text-[var(--text-primary)]">消息提醒</p>
          {unreadCount > 0 ? (
            <button type="button" onClick={() => void markAllRead()} className="text-[var(--accent-strong)] hover:underline" style={{ fontSize: "0.875rem", fontWeight: 600, lineHeight: "1.25rem" }}>
              全部标为已读
            </button>
          ) : null}
        </div>
        <div className="h-px bg-[var(--hairline)]" />
        <div className="max-h-[min(28rem,var(--radix-popover-content-available-height))] overflow-y-auto py-1">
          {loaded && notifications.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">暂无消息</p>
          ) : null}
          {!loaded ? <p className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">正在加载...</p> : null}
          {notifications.map((notification) => (
            <div key={notification.id} className="group flex w-full items-start gap-2 rounded-md px-3 py-2.5 hover:bg-[var(--surface-2)]">
              <button
                type="button"
                onClick={() => void openNotification(notification)}
                className="flex min-w-0 flex-1 items-start gap-3 text-left"
              >
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${notification.readAt ? "bg-transparent" : "bg-[var(--accent)]"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-5 text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--text-primary)]">{notification.actorName}</span>
                    {notification.targetType === "post"
                      ? <>{notification.actorType === "bot" ? "（虾）" : ""} {notification.kind === "mention" ? "在回复中提到了你" : "回复了你的问题帖"}</>
                      : notification.kind === "review_transfer"
                        ? " 把文档审批权转交给了你，请前往详情页进行审批"
                        : notification.kind === "mention" ? " 在评论中提到了你" : <> {notification.actorType === "bot" ? "（虾）" : ""} 评论了你的文档</>}
                  </span>
                  <span className="block truncate text-sm font-medium text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-strong)]">
                    {notification.targetType === "post" ? notification.postTitle : notification.docTitle}
                  </span>
                  <span className="mt-1 block text-xs text-[var(--text-muted)]">{formatRelativeTime(notification.createdAt)}</span>
                </span>
              </button>
              <button
                type="button"
                aria-label="忽略提醒"
                title="忽略提醒"
                onClick={() => void ignoreNotification(notification.id)}
                className="mt-0.5 shrink-0 rounded p-1 text-[var(--text-muted)] opacity-0 transition-opacity hover:bg-[var(--surface-1)] hover:text-[var(--text-primary)] group-hover:opacity-100 focus-visible:opacity-100"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatRelativeTime(value: string): string {
  const elapsed = Math.max(0, Date.now() - Date.parse(value));
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}
