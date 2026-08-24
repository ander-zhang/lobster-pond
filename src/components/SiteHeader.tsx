"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CircleHelp, ClipboardCheck, Home, MessageSquareText, UserRound } from "lucide-react";
import { IconBadge } from "./IconBadge";
import { AnnouncementsDialog } from "./AnnouncementsDialog";
import { NotificationPopover } from "./NotificationPopover";
import { useAuth } from "./auth/AuthProvider";
import { GlowMenu } from "./ui/glow-menu";

const nav = [
  { href: "/", label: "总览", icon: Home, tone: "orange" as const },
  { href: "/posts", label: "问题帖", icon: MessageSquareText, tone: "blue" as const },
  { href: "/library", label: "知识库", icon: BookOpen, tone: "amber" as const },
  { href: "/governance", label: "审核", icon: ClipboardCheck, tone: "mint" as const },
  { href: "/me", label: "我的", icon: UserRound, tone: "rose" as const },
  { href: "/help", label: "帮助", icon: CircleHelp, tone: "silver" as const },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { user, loading, logout, openAuth } = useAuth();
  const activeHref = nav.find((item) => item.href === "/" ? pathname === "/" : pathname.startsWith(item.href))?.href ?? "";

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--hairline)] bg-[rgba(248,250,249,0.82)] backdrop-blur-xl">
      <div className="shell flex min-h-16 flex-wrap items-center justify-between gap-3 py-3 md:flex-nowrap md:py-0">
        {/* 左右两区 md 起 flex-1 等宽，菜单（w-auto）因此始终相对视口居中，
            不再受两侧内容宽度差（logo 文案 / 用户名长度 / 图标增减）影响；
            窄屏下两区退化为内容宽度，菜单可收缩滚动，不会与两侧重叠。
            logo 用 inline-flex 保持可点击区域贴合内容。 */}
        <div className="md:flex-1">
          <Link className="group inline-flex items-center gap-3" href="/">
            <IconBadge icon="tricolor-wave" tone="blue" shape="circle" size="sm" />
            <span className="block text-lg font-semibold tracking-[-0.02em] text-[var(--text-primary)] md:text-xl">
              Lobster Pond
            </span>
          </Link>
        </div>

        <GlowMenu
          activeHref={activeHref}
          className="order-3 w-full overflow-x-auto md:order-none md:w-auto"
          items={nav}
        />

        {/* 登录态区：未登录显示 公告铃铛 + 登录/注册；已登录显示 公告铃铛 + 用户名 + 退出。
            公告入口对所有访客开放（未登录也能看横幅与历史公告）。
            登录/注册弹窗由 AuthProvider 统一管控（未登录时自动弹一次）。 */}
        <div className="order-2 flex items-center gap-2 md:order-none md:flex-1 md:justify-end">
          <AnnouncementsDialog />
          {loading ? null : user ? (
            <>
              <NotificationPopover userId={user.id} />
              <span className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-sm font-medium text-[var(--text-primary)]">
                {user.username}
              </span>
              <button
                type="button"
                onClick={() => void logout()}
                className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                退出
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => openAuth("login")}
                className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                登录
              </button>
              <button
                type="button"
                onClick={() => openAuth("register")}
                className="rounded-full bg-[var(--accent)] px-3 py-1 text-sm font-medium text-white hover:opacity-90"
              >
                注册
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
