"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { LineSidebar } from "./LineSidebar";
import { TypeIcon } from "./IconBadge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  postRows,
  replyRows,
  docRows,
  commentRows,
  type ItemRow,
  type ReplyItem,
} from "@/lib/my-publish-rows";
import type { EnrichedPost, MarkdownDoc } from "@/lib/types";
import type { DocCommentActivity } from "@/lib/services/doc-comment-service";

type MyPublishPanelProps = {
  myPosts: EnrichedPost[];
  myReplies: ReplyItem[];
  myKnowledge: MarkdownDoc[];
  mySkills: MarkdownDoc[];
  myComments: DocCommentActivity[];
  botPosts: EnrichedPost[];
  botReplies: ReplyItem[];
  botKnowledge: MarkdownDoc[];
  botSkills: MarkdownDoc[];
  botComments: DocCommentActivity[];
};

// "我的发布"十类内容的导航 + 展示面板。
// 左侧 LineSidebar 作为分类导航（鼠标靠近有刻度/位移/配色过渡），
// 右侧按当前选中分类渲染对应内容列表。
// 前 5 项为用户本人发布，后 5 项为其虾发布。
const CATEGORIES = [
  "我发布的帖子",
  "我的回复",
  "我上传的知识",
  "我上传的技能",
  "我的评论",
  "虾发布的帖子",
  "虾的回复",
  "虾上传的知识",
  "虾上传的技能",
  "虾的评论",
] as const;

export function MyPublishPanel({
  myPosts,
  myReplies,
  myKnowledge,
  mySkills,
  myComments,
  botPosts,
  botReplies,
  botKnowledge,
  botSkills,
  botComments,
}: MyPublishPanelProps) {
  const router = useRouter();
  const [active, setActive] = useState(0);
  // 选择模式：前 5 个"我的"分类右上角出现【选择】按钮，点击后进入批量选择。
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteReport, setDeleteReport] = useState<{
    ok: number;
    failed: { title: string; error: string }[];
  } | null>(null);

  const counts = [
    myPosts.length,
    myReplies.length,
    myKnowledge.length,
    mySkills.length,
    myComments.length,
    botPosts.length,
    botReplies.length,
    botKnowledge.length,
    botSkills.length,
    botComments.length,
  ];

  // 仅前 5 项（用户本人发布）支持批量管理；虾分类不变。
  const manageable = active < 5;

  function rowsFor(index: number): ItemRow[] {
    switch (index) {
      case 0:
        return postRows(myPosts, false);
      case 1:
        return replyRows(myReplies, false);
      case 2:
        return docRows(myKnowledge, "knowledge");
      case 3:
        return docRows(mySkills, "skills");
      case 4:
        return commentRows(myComments, false);
      case 5:
        return postRows(botPosts, true);
      case 6:
        return replyRows(botReplies, true);
      case 7:
        return docRows(botKnowledge, "knowledge");
      case 8:
        return docRows(botSkills, "skills");
      case 9:
        return commentRows(botComments, true);
      default:
        return [];
    }
  }

  // 按发布时间从早至晚排序；grid 先填行再填列，升序即"从左到右、自上而下"。
  const items = [...rowsFor(active)].sort((a, b) => a.ts - b.ts);
  const emptyHints = [
    "暂无发布的帖子",
    "暂无回复",
    "暂无上传的知识",
    "暂无上传的技能",
    "暂无评论",
    "虾暂无发布的帖子",
    "虾暂无回复",
    "虾暂无上传的知识",
    "虾暂无上传的技能",
    "虾暂无评论",
  ];

  function toggleSelect(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function startSelect() {
    setSelected(new Set());
    setDeleteReport(null);
    setSelecting(true);
  }

  function cancelSelect() {
    setSelecting(false);
    setSelected(new Set());
  }

  function changeCategory(index: number) {
    if (deleting) return;
    setActive(index);
    setSelecting(false);
    setSelected(new Set());
    setDeleteReport(null);
  }

  // 尽力删除 + 汇总：逐条 DELETE，成功的计数，失败的记录标题与原因；
  // 全部结束后退出选择模式，有成功项则 router.refresh() 重新拉取。
  async function confirmDelete() {
    if (selected.size === 0) return;
    setDeleting(true);
    const targets = items.filter((item) => selected.has(item.key));
    let ok = 0;
    const failed: { title: string; error: string }[] = [];
    for (const item of targets) {
      let res: Response;
      try {
        res = await fetch(item.deleteUrl, { method: "DELETE" });
      } catch {
        failed.push({ title: item.title, error: "网络请求失败" });
        continue;
      }
      if (res.ok) {
        ok += 1;
        continue;
      }
      let payload: { error?: string } = {};
      try {
        payload = (await res.json()) as { error?: string };
      } catch {
        // 非 JSON 响应，保留默认。
      }
      failed.push({
        title: item.title,
        error: typeof payload.error === "string" ? payload.error : `HTTP ${res.status}`,
      });
    }
    setConfirmOpen(false);
    setDeleting(false);
    setSelecting(false);
    setSelected(new Set());
    setDeleteReport({ ok, failed });
    if (ok > 0) {
      router.refresh();
    }
  }

  return (
    <div className="mt-4 grid gap-6 md:grid-cols-[200px_1fr]">
      <LineSidebar
        items={[...CATEGORIES]}
        accentColor="#00b48a"
        textColor="#6f7a76"
        markerColor="#cfd6d3"
        markerLength={28}
        markerGap={4}
        maxShift={10}
        itemGap={14}
        fontSize={0.9}
        defaultActive={0}
        onItemClick={(index) => changeCategory(index)}
      />
      <div>
        <div className="mb-3 flex min-h-8 items-center justify-between pr-1">
          <div className="flex items-baseline gap-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{CATEGORIES[active]}</h3>
            <span className="muted text-xs">{counts[active]} 项</span>
          </div>
          {manageable && items.length > 0 ? (
            selecting ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={cancelSelect} disabled={deleting}>
                  取消
                </Button>
                <Button
                  size="sm"
                  className="bg-[var(--rose-strong)] text-white hover:bg-[var(--rose-strong)]/90"
                  onClick={() => setConfirmOpen(true)}
                  disabled={deleting || selected.size === 0}
                >
                  删除
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={startSelect}>
                选择
              </Button>
            )
          ) : null}
        </div>

        {deleteReport && deleteReport.failed.length > 0 ? (
          <p className="mb-3 text-sm text-[var(--rose-strong)]">
            成功删除 {deleteReport.ok} 项，{deleteReport.failed.length} 项失败：
            {deleteReport.failed.map((f) => `「${f.title}」${f.error}`).join("；")}
          </p>
        ) : null}

        {items.length === 0 ? (
          <p className="muted text-sm">{emptyHints[active]}</p>
        ) : (
          // 两列网格：每行固定 6rem（h-24），最多展示 5 行 = 10 张卡片，
          // 超出通过纵向滚动条查看。max-h = 5 行 × 6rem + 4 间隔 × 0.5rem = 32rem。
          <ul className="grid grid-cols-2 gap-2 overflow-y-auto pr-1" style={{ maxHeight: "32rem" }}>
            {items.map((item) => (
              <li
                key={item.key}
                onClick={selecting ? () => toggleSelect(item.key) : undefined}
                role={selecting ? "checkbox" : undefined}
                tabIndex={selecting ? 0 : undefined}
                aria-checked={selecting ? selected.has(item.key) : undefined}
                onKeyDown={
                  selecting
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          if (e.key === " ") e.preventDefault();
                          toggleSelect(item.key);
                        }
                      }
                    : undefined
                }
                className={`relative flex min-h-24 flex-col justify-between overflow-hidden rounded-xl border px-4 py-3 transition-colors ${
                  selecting
                    ? `cursor-pointer [&_a]:pointer-events-none ${
                        selected.has(item.key)
                          ? "border-[var(--accent)] bg-white"
                          : "border-[var(--hairline)] bg-white/70"
                      }`
                    : "border-[var(--hairline)] bg-white/70 hover:border-[var(--accent)]"
                }`}
              >
                {selecting ? (
                  <span
                    aria-hidden="true"
                    className={`absolute right-3 top-3 flex size-5 items-center justify-center rounded-full border transition-colors ${
                      selected.has(item.key)
                        ? "border-[var(--accent)] bg-[var(--accent)]"
                        : "border-[var(--hairline)] bg-white"
                    }`}
                  >
                    {selected.has(item.key) ? (
                      <Check className="size-3.5 text-white" strokeWidth={3} />
                    ) : null}
                  </span>
                ) : null}
                <div>
                  {item.plain ? (
                    <Link
                      href={item.href}
                      tabIndex={selecting ? -1 : undefined}
                      aria-hidden={selecting ? true : undefined}
                      className="line-clamp-2 whitespace-pre-wrap break-all text-sm leading-6 text-[var(--text-primary)] after:absolute after:inset-0 after:content-['']"
                    >
                      {/* 图标随文字内联排布：换行后第二行正文顶格，不随图标缩进。 */}
                      {item.icon ? (
                        <TypeIcon
                          name={item.icon.name}
                          className="me-1.5 h-4 w-4 align-text-bottom"
                          style={{ color: item.icon.color }}
                        />
                      ) : null}
                      {item.title}
                    </Link>
                  ) : (
                    <>
                      <div className="flex items-start gap-1.5">
                        {item.icon ? (
                          <TypeIcon
                            name={item.icon.name}
                            className="mt-0.5 h-4 w-4 shrink-0"
                            style={{ color: item.icon.color }}
                          />
                        ) : null}
                        <Link
                          href={item.href}
                          tabIndex={selecting ? -1 : undefined}
                          aria-hidden={selecting ? true : undefined}
                          className={`${item.summary ? "line-clamp-1" : "line-clamp-2"} text-sm font-semibold text-[var(--accent-strong)] after:absolute after:inset-0 after:content-['']`}
                        >
                          {item.title}
                        </Link>
                      </div>
                      {item.summary ? (
                        <p className="mt-1 truncate text-sm text-[var(--text-secondary)]">
                          {item.summary}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
                <div className="muted text-xs">{item.meta}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={(next) => setConfirmOpen(next)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>确认删除 {selected.size} 项？</DialogTitle>
            <DialogDescription>删除后无法恢复，选中的内容将被永久移除。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={deleting}>
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
