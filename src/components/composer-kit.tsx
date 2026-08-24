"use client";

import Link from "next/link";
import type { ReactNode, RefObject } from "react";

// 回复/评论编辑器共享件：提及类型与纯函数、提及高亮渲染、候选 Picker、镜像滚动同步。
// PostReplyPanel（技能 + 提及双补全）与 DocCommentPanel（仅提及）共用，新增编辑器时同样从这里取。

export type Mention = { targetType: "user" | "bot"; targetId: string; name: string };

export function hasMentionToken(content: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)@${escapedName}(?=\\s|$)`).test(content);
}

export function tokenContext(value: string, caret: number, token: "/" | "@"): string | null {
  let index = caret - 1;
  while (index >= 0 && !/\s/.test(value[index])) {
    if (value[index] === token) {
      return index === 0 || /\s/.test(value[index - 1]) ? value.slice(index + 1, caret) : null;
    }
    index -= 1;
  }
  return null;
}

// 合并持久化 mentionRefs 与正文扫描出的提及，按 targetType+targetId 对存量去重。
export function mergeMentionRefs(stored: Mention[] | null | undefined, content: string, mentions: Mention[]): Mention[] {
  const base = stored ?? [];
  return [...base, ...mentions.filter((mention) => hasMentionToken(content, mention.name)).filter((mention) => !base.some((item) => item.targetType === mention.targetType && item.targetId === mention.targetId))];
}

// 高亮镜像层与真实输入层保持滚动位置一致。
export function syncMirrorScroll(textareaRef: RefObject<HTMLTextAreaElement | null>, mirrorRef: RefObject<HTMLDivElement | null>) {
  if (textareaRef.current && mirrorRef.current) {
    mirrorRef.current.scrollTop = textareaRef.current.scrollTop;
    mirrorRef.current.scrollLeft = textareaRef.current.scrollLeft;
  }
}

// 渲染单个 @提及 token：命中名单才高亮；虾名带可点链接；emphasize 时加粗（评论展示态用）。
export function renderMentionToken(name: string, matched: boolean, botId: string | undefined, emphasize = false): ReactNode {
  if (!matched) return `@${name}`;
  if (botId) {
    return <span style={{ color: "var(--blue-strong)" }}><span>@</span><Link href={`/bots/${encodeURIComponent(botId)}`} className={`mention-bot-link${emphasize ? " font-medium" : ""}`}>{name}</Link></span>;
  }
  return <span style={{ color: "var(--blue-strong)" }} className={emphasize ? "font-medium" : undefined}>{`@${name}`}</span>;
}

// 提及候选项的统一展示：@名字 + 虾/用户标注。
export function renderMentionOption(mention: Mention): ReactNode {
  return <><span className="text-[var(--blue-strong)]">@{mention.name}</span><span className="text-[var(--text-muted)]">{mention.targetType === "bot" ? "虾" : "用户"}</span></>;
}

export function Picker<T>({ items, index, listId, onPick, render, onHover }: { items: T[]; index: number; listId: string; onPick: (item: T) => void; render: (item: T) => ReactNode; onHover: (index: number) => void }) {
  return <div id={listId} role="listbox" className="reply-picker absolute bottom-full left-0 z-10 mb-2 max-h-[20.5rem] w-full overflow-y-auto rounded-xl border border-[var(--hairline)] bg-white p-1 shadow-lg">
    {items.map((item, itemIndex) => <button id={`${listId}-option-${itemIndex}`} key={itemIndex} type="button" role="option" aria-selected={itemIndex === index} onMouseEnter={() => onHover(itemIndex)} onMouseDown={(event) => event.preventDefault()} onClick={() => onPick(item)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm leading-5 ${itemIndex === index ? "bg-[var(--surface-2)]" : ""}`}>
      {render(item)}
    </button>)}
  </div>;
}
