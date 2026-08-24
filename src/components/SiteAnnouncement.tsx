"use client";

import { type CSSProperties, useSyncExternalStore, useState } from "react";
import { Megaphone, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MarkdownBody } from "@/components/MarkdownBody";
import { markAnnouncementRead } from "@/lib/announcement-read-state";
import type { Announcement } from "@/lib/announcements";

type SiteAnnouncementProps = {
  announcement: Announcement | null;
};

// 取消状态按公告 id 写入 localStorage，仅对该浏览器生效；换浏览器 / 清缓存后重新显示。
function storageKey(id: string): string {
  return `announcement-dismissed-${id}`;
}

// 同标签 dismiss 后派发自定义事件，让 useSyncExternalStore 重新读快照；跨标签页由 storage 事件兜。
const DISMISS_CHANGED_EVENT = "announcement-dismiss-changed";

// useSyncExternalStore 的订阅函数：storage 事件（跨标签页）+ 自定义 dismiss 事件（同标签）触发重读。
// 必须引用稳定（模块级），否则每次渲染会重订阅。
function subscribeDismissed(onChange: () => void): () => void {
  const handler = () => onChange();
  window.addEventListener("storage", handler);
  window.addEventListener(DISMISS_CHANGED_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(DISMISS_CHANGED_EVENT, handler);
  };
}

// SSR / hydration 首帧的服务端快照恒为「已取消」→ 渲染 null，与客户端首帧一致、无水合错配；
// hydration 后 useSyncExternalStore 同步用客户端快照重读，已取消横幅自始不绘制、未取消横幅在
// 首帧直接出现——杜绝原写法 setTimeout(0) 把判定延到宏任务导致的「刷新后先画一帧再消失」闪现。
const serverSnapshotDismissed = (): boolean => true;

function useAnnouncementDismissed(id: string): boolean {
  return useSyncExternalStore(
    subscribeDismissed,
    () => (id ? localStorage.getItem(storageKey(id)) === "true" : false),
    serverSnapshotDismissed,
  );
}

// 横幅背景流动渐变：在总览页 hero 标题「虾塘」四色（玫瑰/蓝/琥珀/薄荷）基础上
// 加入暖橙（var(--orange) = #ff6900，置于玫瑰之后），100deg、首尾同色玫瑰保证循环接缝无跳变，
// 复用 globals.css 的 title-gradient-shift 关键帧做恒速单向位移（7s），铺满整条横幅。
// 相对 hero 标题的纯色，这里做两处弱化以避免过深：
// - 提亮：color-mix 各混入 25% 白；
// - 降透明：整体 opacity 0.7（透出下方白底）。
const BANNER_GRADIENT =
  "linear-gradient(100deg, " +
  "color-mix(in srgb, #b2343f 75%, white) 0%, " +
  "color-mix(in srgb, var(--orange) 75%, white) 20%, " +
  "color-mix(in srgb, #245cb3 75%, white) 40%, " +
  "color-mix(in srgb, #9d5f04 75%, white) 60%, " +
  "color-mix(in srgb, #00b48a 75%, white) 80%, " +
  "color-mix(in srgb, #b2343f 75%, white) 100%)";

function TitleGradientFlow() {
  const style = {
    animation: "title-gradient-shift 7s linear infinite",
    backgroundImage: BANNER_GRADIENT,
    backgroundPosition: "0% 50%",
    backgroundSize: "200% 100%",
    opacity: 0.7,
  } as CSSProperties;

  return <div className="absolute inset-0 z-0" style={style} aria-hidden="true" />;
}

// 总览页页眉下方的通栏公告横幅：hero 同款流动渐变底 + 居中标题 + 右对齐关闭按钮。
// 全宽横条直接贴在页眉（菜单横栏）之下，与页眉共用 .shell 宽度对齐；不再作为内容区里的瓦片。
// 点击标题打开详情弹窗（markdown 正文），点击关闭按钮持久隐藏。无公告或已取消时不渲染。
export function SiteAnnouncement({ announcement }: SiteAnnouncementProps) {
  const id = announcement?.id ?? "";
  const dismissed = useAnnouncementDismissed(id);
  const [open, setOpen] = useState(false);

  if (!announcement || dismissed) {
    return null;
  }

  function dismiss() {
    localStorage.setItem(storageKey(announcement!.id), "true");
    window.dispatchEvent(new Event(DISMISS_CHANGED_EVENT));
  }

  return (
    <>
      <div className="relative overflow-hidden border-b border-[var(--hairline)] bg-white">
        <TitleGradientFlow />
        <div className="shell relative z-10 flex h-12 items-center justify-center">
          <button
            type="button"
            onClick={() => {
              // 点击公告标题查看详情即视为已读该条（与页眉公告入口共享已读状态，
              // 未读计数气泡随之减少）；右侧「取消」仅关闭横幅，不记已读。
              markAnnouncementRead(announcement.id);
              setOpen(true);
            }}
            className="group max-w-full truncate px-12 text-sm text-white transition-opacity hover:opacity-80"
            style={{
              // 行高 40px + span 的 pb-0.5：inline 盒的 border-bottom 只贴着字体内容盒底边，
              // 单靠行高撑不出间距；这里用行高把内容盒居中抬升、再用 padding-bottom 把边框
              // 轻轻下推，使下划线与字形间留少许空隙，且线保持在 40px 盒内，
              // 不被 truncate 的 overflow: hidden 裁掉。
              // 不能用 Tailwind 的 leading-*——globals.css 未分层的
              // `button { font: inherit }` 会连 line-height 一起覆盖，只能内联。
              lineHeight: "40px",
              // 黑色勾边 + 白色填充：用 8 方向黑色 text-shadow 在字形四周描一圈黑边，
              // 中心仍为白色填充（不侵占字形内部，区别于 -webkit-text-stroke 向内描边）。
              // 注意 text-shadow 会沿用到 text-decoration 上（装饰线也被描黑边），
              // 所以悬停下划线不用 underline，改用下方 span 的 border-bottom。
              textShadow:
                "1px 0 0 #000, -1px 0 0 #000, 0 1px 0 #000, 0 -1px 0 #000, " +
                "1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000",
            }}
          >
            {/* 公告图标：继承 currentColor 白色；4 方向 drop-shadow 模拟文字的黑勾边。
                放在下划线 span 之外，悬停下划线仍只包文字。 */}
            <Megaphone
              aria-hidden="true"
              className="mr-1 inline-block h-4 w-4 align-middle"
              style={{
                filter:
                  "drop-shadow(1px 0 0 #000) drop-shadow(-1px 0 0 #000) " +
                  "drop-shadow(0 1px 0 #000) drop-shadow(0 -1px 0 #000)",
              }}
            />
            {/* 悬停下划线：span 是 inline 盒，border-bottom 只包文字宽度且不受 text-shadow 影响，
                呈现纯白实线；透明边框常驻避免悬停时抖动。 */}
            <span className="border-b border-transparent pb-0.5 transition-colors group-hover:border-white">
              {announcement.title}
            </span>
          </button>
        </div>
        {/* 关闭按钮：黑色 X，绝对定位在全宽横幅（而非 .shell 内容区）的最右侧。 */}
        <Button
          type="button"
          aria-label="关闭公告"
          onClick={dismiss}
          variant="ghost"
          size="icon"
          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 text-black hover:bg-white/60 hover:text-black"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{announcement.title}</DialogTitle>
            <DialogDescription className="sr-only">网站公告详情</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <MarkdownBody body={announcement.body} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
