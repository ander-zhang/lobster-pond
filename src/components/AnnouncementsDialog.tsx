"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MarkdownBody } from "@/components/MarkdownBody";
import {
  ANNOUNCEMENTS_READ_CHANGED_EVENT,
  getReadAnnouncementIds,
  markAllAnnouncementsRead,
  markAnnouncementRead,
  migrateLegacyReadMarker,
} from "@/lib/announcement-read-state";
import { cn } from "@/lib/utils";
import type { Announcement } from "@/lib/announcements";

type AnnouncementsPayload = {
  ok: boolean;
  announcements: Announcement[];
};

// public/note.svg 的内联版：原文件 stroke 硬编码 #ffffff，在浅色页眉上不可见，
// 这里改为 stroke="currentColor"，与 lucide 铃铛一致继承按钮文字色（灰 → 悬停变黑）；
// strokeWidth 从 1.5 改为 2，与消息提醒铃铛（lucide 默认）的线条粗细一致。
function NoteIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeMiterlimit="10"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 2V5" />
      <path d="M16 2V5" />
      <path d="M7 13H15" />
      <path d="M7 17H12" />
      <path d="M16 3.5C19.33 3.68 21 4.95 21 9.65V15.83C21 19.95 20 22.01 15 22.01H9C4 22.01 3 19.95 3 15.83V9.65C3 4.95 4.67 3.69 8 3.5H16Z" />
    </svg>
  );
}

// 页眉消息提醒左侧的公告入口：与铃铛同款的圆形幽灵图标按钮，存在未读公告时右上角
// 红色气泡显示具体未读条数。点击弹窗以时间线样式展示近一个月全部公告：每条标题左侧
// 是圆形对勾按钮（未读=白底灰勾 / 已读=绿底白勾），竖线颜色跟随下一条的已读状态；
// 弹窗右上角（关闭按钮左侧）有「全部已读」按钮。已读状态存 localStorage（按公告 id 集合），
// 与总览页横幅共享（横幅点击最新公告标题也会记该条已读；取消横幅不记）。
// 组件仅在登录态渲染（见 SiteHeader），挂载时即拉取一次：既做未读计数，也复用为弹窗数据。
export function AnnouncementsDialog() {
  const [open, setOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    // 用 setTimeout(0) 延后到宏任务，避免在 effect 体内同步 setState
    //（react-hooks/set-state-in-effect），与 SiteAnnouncement 同款写法。
    const timer = window.setTimeout(() => setReadIds(getReadAnnouncementIds()), 0);
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/announcements", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as AnnouncementsPayload;
        if (cancelled) return;
        // 旧版"最近已读 id"单键迁移为 id 集合（仅首次；之后以新键为准）。
        migrateLegacyReadMarker(payload.announcements);
        setAnnouncements(payload.announcements);
        setLoaded(true);
        setReadIds(getReadAnnouncementIds());
      } catch {
        // 挂载拉取失败保持静默：气泡不亮，打开弹窗时 load() 会重试。
      }
    })();
    // 其他组件（总览页横幅）标记已读后同步本组件的未读计数与时间线按钮样式。
    const syncReadIds = () => setReadIds(getReadAnnouncementIds());
    window.addEventListener(ANNOUNCEMENTS_READ_CHANGED_EVENT, syncReadIds);
    return () => {
      window.clearTimeout(timer);
      cancelled = true;
      window.removeEventListener(ANNOUNCEMENTS_READ_CHANGED_EVENT, syncReadIds);
    };
  }, []);

  async function load() {
    if (loaded) return;
    try {
      const response = await fetch("/api/announcements", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as AnnouncementsPayload;
      setAnnouncements(payload.announcements);
      setLoaded(true);
    } catch {
      // 公告加载失败时保持静默，弹窗内显示空态文案，不影响站点其他功能。
      setLoaded(true);
    }
  }

  const unreadCount = announcements.filter((announcement) => !readIds.has(announcement.id)).length;

  function handleMarkAllRead() {
    // 写入后派发的事件会同步刷新 readIds，气泡与时间线按钮随之更新。
    markAllAnnouncementsRead(announcements.map((announcement) => announcement.id));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          void load();
        }}
        className="relative flex size-9 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
        aria-label="网站公告"
        title={unreadCount > 0 ? `网站公告（${unreadCount} 条未读）` : "网站公告"}
      >
        <NoteIcon className="size-[18px]" />
        {/* 未读气泡：显示具体未读条数，白圈描边使其压在图标线条上仍清晰。 */}
        {unreadCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--rose-strong)] px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[560px]">
          {/* 全部已读：绝对定位于内容区右上角、关闭 X（right-3 top-3 size-7）左侧。
              仅在存在未读时出现，避免与标题争抢视觉焦点。 */}
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="absolute right-11 top-3 flex h-7 items-center rounded-lg px-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
            >
              全部已读
            </button>
          ) : null}
          <DialogHeader>
            <DialogTitle>网站公告</DialogTitle>
            <DialogDescription className="sr-only">近一个月的全部网站公告</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {!loaded ? (
              <p className="py-8 text-center text-sm text-[var(--text-muted)]">正在加载...</p>
            ) : announcements.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--text-muted)]">近一个月暂无公告</p>
            ) : (
              <div>
                {announcements.map((announcement, index) => {
                  const read = readIds.has(announcement.id);
                  // 与参考时间线一致：连接线颜色跟随下一条节点的状态（已读绿 / 未读灰）。
                  const nextRead =
                    index < announcements.length - 1 && readIds.has(announcements[index + 1].id);
                  return (
                    <div key={announcement.id} className="flex">
                      <div className="flex flex-col items-center">
                        {/* 已读标记按钮：未读=白底灰勾（可点击），已读=绿底白勾（置灰锁定）。
                            已读为单向操作，不提供"标回未读"。 */}
                        <button
                          type="button"
                          disabled={read}
                          aria-pressed={read}
                          aria-label={read ? `已读：${announcement.title}` : `标记已读：${announcement.title}`}
                          title={read ? "已读" : "标记为已读"}
                          onClick={() => markAnnouncementRead(announcement.id)}
                          className={cn(
                            "flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                            read
                              ? "border-transparent bg-[var(--accent-strong)] text-white"
                              : "border-[var(--hairline-strong)] bg-white text-[var(--text-muted)] hover:border-[var(--accent-strong)] hover:text-[var(--accent-strong)]",
                          )}
                        >
                          <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                        </button>
                        {index < announcements.length - 1 ? (
                          <div
                            aria-hidden="true"
                            className={cn(
                              "w-[1.5px] grow",
                              nextRead ? "bg-[var(--accent-strong)]/70" : "bg-[var(--hairline-strong)]",
                            )}
                          />
                        ) : null}
                      </div>
                      <div className="ml-3 min-w-0 flex-1 pb-6">
                        <div className="mb-2 flex items-baseline justify-between gap-3">
                          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{announcement.title}</h3>
                          {announcement.date ? (
                            <time className="shrink-0 text-xs text-[var(--text-muted)]">{announcement.date}</time>
                          ) : null}
                        </div>
                        <MarkdownBody body={announcement.body} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
