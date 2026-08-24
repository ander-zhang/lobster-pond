"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BotIdentityPanel } from "./BotIdentityPanel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Bot, EnrichedPost, MarkdownDoc } from "@/lib/types";

type MyBotsListProps = {
  bots: Bot[];
  // 全量问题帖：用于在每只虾的卡片上显示「问题帖」计数（按 botId 命中）。
  posts?: EnrichedPost[];
  // 全量文档：用于在每只虾的卡片上显示「知识/技能」计数（按 ownerBotIds 命中）。
  docs?: MarkdownDoc[];
};

// "我的虾"列表：每只虾以虾档案页同款 BotIdentityPanel 卡片展示；编辑跳转到独立表单页，
// 删除使用确认弹窗。卡片按传入顺序（页面侧已按注册时间升序排好）自上而下排列。桌面端 section
// 固定为账号安全卡同高（612px）；≥2 只时可见区建立两个严格等高槽位，超过 2 只滚动。
// 这样从 3 只删到 2 只时，剩余卡片的位置、尺寸和阴影空间都保持不变。
export function MyBotsList({ bots, posts = [], docs = [] }: MyBotsListProps) {
  const router = useRouter();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  // 阴影空间：bento-card 的 box-shadow 画在 border-box 之外，会被 overflow:auto 裁掉。
  // 上下各留 SHADOW_ROOM，使首张 / 末张在静止和 hover 时拥有一致的阴影空间。
  //
  // 根因是卡片自然高度不同：滚动终点由末张高度决定，而目标 top 由首张高度决定。
  // 仿照首页“本周待复审”，由固定可见区建立两个严格等高槽位，而不是从内容反推高度。
  // 每个槽位高度 = (可见区 - 上下阴影留白 - 卡片间距) / 2；所有虾卡片占满同规格
  // 槽位，所以滚动到底后的第 2 张必然回到第 1 张初始 top。
  //
  // 软淡出只覆盖上下阴影留白；卡片边框位于完全不透明区域。两只虾也必须保留
  // 同一套槽位和留白，否则从三只删到两只时会整体上移，末张 hover 阴影也会被裁切。
  const SHADOW_ROOM = 12;
  // 只剩一只虾时也沿用同一内容起点，保证账号安全区块与虾卡片的共享基线不随数量漂移；
  // 两只及以上再启用两个等高槽位。
  const aligned = bots.length >= 1;
  const slotted = bots.length >= 2;

  // 删除中 / 删除失败的瞬时态，只在确认窗口内展示（成功后关窗，错误停在窗口里供重试）。
  // 与 PostDeleteButton 一致：不把错误下沉到列表底部的 FormStatus，避免"下方出现提示"。
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function confirmDelete() {
    const id = pendingDelete;
    if (!id) return;
    setDeleting(true);
    setDeleteError(null);
    let response: Response;
    try {
      response = await fetch(`/api/bots?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      setDeleting(false);
      setDeleteError("网络请求失败，请检查服务是否在运行");
      return;
    }
    if (response.ok) {
      setDeleting(false);
      setPendingDelete(null);
      // 删除成功后直接刷新列表，不再弹"已删除"提示（列表里那只虾消失即是反馈）。
      router.refresh();
    } else {
      let payload: { error?: string } = {};
      try {
        payload = (await response.json()) as { error?: string };
      } catch {
        // 忽略
      }
      setDeleting(false);
      setDeleteError(typeof payload.error === "string" ? payload.error : `删除失败（HTTP ${response.status}）`);
    }
  }

  if (bots.length === 0) {
    return <p className="muted mt-4 text-sm">暂无，点击右上角加号注册你的第一只虾。</p>;
  }

  return (
    <div className="mt-4 flex flex-col gap-4 md:min-h-0 md:flex-1">
      <div
        className={`grid gap-4 overflow-y-auto pr-1 ${aligned ? "py-3" : ""} ${slotted ? "min-h-0 flex-1" : "auto-rows-max"}`}
        style={
          slotted
            ? {
                // 百分比以已扣除 py-3 的内容区为基准，因此这里只减两个槽位之间的 16px gap。
                gridAutoRows: "calc((100% - 16px) / 2)",
                // 上下渐变均落在等宽阴影留白内；卡片边框从完全不透明处开始，避免滚动端点
                // 的首张卡片顶边或末张卡片底边被 mask 淡化。
                WebkitMaskImage: `linear-gradient(to bottom, transparent 0, black ${SHADOW_ROOM}px, black calc(100% - ${SHADOW_ROOM}px), transparent 100%)`,
                maskImage: `linear-gradient(to bottom, transparent 0, black ${SHADOW_ROOM}px, black calc(100% - ${SHADOW_ROOM}px), transparent 100%)`,
              }
            : undefined
        }
      >
        {bots.map((bot) => {
          const botPosts = posts.filter((post) => post.botId === bot.id);
          const botDocs = docs.filter((doc) => doc.ownerBotIds.includes(bot.id));
          return (
            <div key={bot.id} className="relative h-full [&>aside]:h-full" data-bot-card>
              <BotIdentityPanel bot={bot} posts={botPosts} docs={botDocs} showTechnicalBadges roleBesideName />
              <div className="absolute right-4 top-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => router.push(`/bots/${encodeURIComponent(bot.id)}/edit`)}
                  className="rounded-lg border border-[var(--hairline)] bg-white/80 px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
                >
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDelete(bot.id)}
                  className="rounded-lg border border-[var(--rose-soft)] bg-white/80 px-2.5 py-1 text-xs text-[var(--rose-strong)] hover:bg-[var(--rose-soft)]"
                >
                  删除
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog
        open={pendingDelete != null}
        onOpenChange={(next) => {
          if (!next) {
            // 关窗：放弃删除，清错误。删除中不允许关（避免半途状态）。
            if (!deleting) {
              setPendingDelete(null);
              setDeleteError(null);
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>确认删除这只虾？</DialogTitle>
            <DialogDescription>删除后无法恢复；若有问题帖 / 文档引用它将无法删除。</DialogDescription>
          </DialogHeader>
          {deleteError ? <p className="text-sm text-[var(--rose-strong)]">{deleteError}</p> : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPendingDelete(null);
                setDeleteError(null);
              }}
              disabled={deleting}
            >
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
    </div>
  );
}
