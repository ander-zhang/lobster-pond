"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { GovernanceItem } from "@/lib/governance";
import type { Bot } from "@/lib/types";
import { dateKeyInTimezone, domainBadgeClass, domainLabel } from "@/lib/format";
import { StateBadge } from "./StateBadge";
import { DateRangeFilter } from "./DateRangeFilter";
import { FilterSelect } from "./FilterSelect";
import { IconBadge } from "./IconBadge";

type ReviewingQueueProps = {
  items: GovernanceItem[];
  bots: Bot[];
};

const KIND_LABEL: Record<GovernanceItem["kind"], string> = {
  knowledge: "知识",
  skills: "技能",
};

// 复盘中队列：被驳回、等待修订的知识/技能文档。问题帖已无复盘中状态（驳回已废弃），
// 故此队列只含文档，与"待审核的知识/技能"、"待留意的知识/技能"队列结构一致。
export function ReviewingMixedQueue({ items, bots }: ReviewingQueueProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const reviewingItems = useMemo(() => items.filter((item) => item.state === "Reviewing"), [items]);

  // 仅保留实际关联到至少一条复盘中文档的虾，供搜索框按虾名匹配（虾下拉筛选已移除）。
  const ownerBots = useMemo(() => {
    const ownerIds = new Set(reviewingItems.flatMap((item) => item.ownerBotIds));
    const botsById = new Map(bots.map((bot) => [bot.id, bot] as const));
    return Array.from(ownerIds)
      .map((id) => botsById.get(id))
      .filter((bot): bot is Bot => bot !== undefined);
  }, [reviewingItems, bots]);

  const botNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const bot of ownerBots) map.set(bot.id, bot.name);
    return map;
  }, [ownerBots]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reviewingItems.filter((item) => {
      const botNames = item.ownerBotIds.map((id) => botNameById.get(id) ?? "").join(" ");
      const matchesQuery =
        !q ||
        [item.title, item.summary, item.id, item.authorName ?? "", botNames].some((value) =>
          value.toLowerCase().includes(q),
        );
      const itemDate = dateKeyInTimezone(item.publishedAt);
      return (
        matchesQuery &&
        (category === "all" || item.kind === category) &&
        (!dateFrom || itemDate >= dateFrom) &&
        (!dateTo || itemDate <= dateTo)
      );
    });
  }, [botNameById, category, dateFrom, dateTo, query, reviewingItems]);

  const listRef = useRef<HTMLDivElement>(null);
  const [listMaxHeight, setListMaxHeight] = useState<number | undefined>(undefined);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => {
      const cards = Array.from(el.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
      setListMaxHeight(cards.length > 5 ? Math.max(0, cards[5].getBoundingClientRect().top - el.getBoundingClientRect().top) : undefined);
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const child of el.children) if (child instanceof HTMLElement) ro.observe(child);
    return () => ro.disconnect();
  }, [filtered]);

  return (
    <section className="bento-card p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">复盘中的知识/技能</h2>
        <span className="mono rounded-full border border-[var(--hairline)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">{reviewingItems.length}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <label className="col-span-2 block">
          <span className="tiny-label">搜索</span>
          <input className="mt-2 w-full rounded-xl border border-[var(--hairline)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] shadow-[0_8px_18px_rgba(42,67,101,0.06)]" placeholder="标题、摘要、虾、用户名" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <FilterSelect label="类别" value={category} onChange={setCategory} options={[{ value: "knowledge", label: "知识" }, { value: "skills", label: "技能" }]} />
        <div className="block"><span className="tiny-label">日期</span><DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} onChange={({ dateFrom: from, dateTo: to }) => { setDateFrom(from); setDateTo(to); }} /></div>
      </div>
      <p className="mono mt-2 text-xs text-[var(--text-muted)]">当前显示 {filtered.length} 个复盘中文档</p>
      <div ref={listRef} className="mt-3 space-y-3 overflow-y-auto py-1 pr-1" style={listMaxHeight !== undefined ? { maxHeight: listMaxHeight } : undefined}>
        {filtered.length === 0 ? <p className="rounded-xl border border-dashed border-[var(--hairline)] bg-white/60 p-4 text-sm text-[var(--text-muted)]">当前没有匹配的复盘中文档</p> : filtered.map((item) => <DocPreview item={item} key={`${item.kind}-${item.id}`} />)}
      </div>
    </section>
  );
}

// 与 ReviewItemQueue 保持相同的文档预览标记和样式。
function DocPreview({ item }: { item: GovernanceItem }) {
  const isSkill = item.kind === "skills";
  return <article className={`bento-card problem-card interactive-card group p-3${isSkill ? " skill-preview-card" : " knowledge-preview-card"}`}>
    <div className="flex flex-wrap items-center gap-2">
      <IconBadge className="problem-card-icon" icon={isSkill ? "spark" : "book"} tone={isSkill ? "mint" : "amber"} shape="circle" size="sm" />
      <span className="mono rounded-md border border-[var(--hairline)] bg-white px-2 py-0.5 text-xs text-[var(--text-secondary)]">{KIND_LABEL[item.kind]}</span>
      {item.domain ? <span className={`mono rounded-md px-2 py-0.5 text-xs ${domainBadgeClass(item.domain)}`}>{domainLabel(item.domain)}</span> : null}
      <StateBadge state={item.state} size="sm" className="ml-auto state-badge-black" />
    </div>
    <Link href={`${item.href}?from=governance`}><h2 className="mt-3 text-sm font-semibold tracking-[-0.02em] text-[var(--text-primary)] transition group-hover:text-[var(--accent-strong)]">{item.title}</h2></Link>
    {item.reasons && item.reasons.length > 0 ? (
      <ul className="mt-1.5 space-y-0.5">
        {item.reasons.map((reason) => (
          <li className="flex gap-1 text-xs leading-5 text-[var(--amber-strong)]" key={reason}><span aria-hidden>•</span>{reason}</li>
        ))}
      </ul>
    ) : <p className="muted mt-1.5 truncate text-xs leading-5">{item.summary}</p>}
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] pt-2.5">
      <span className="flex items-center gap-2 font-medium text-[var(--text-primary)]"><span className="text-xs">{item.authorName ?? "未署名"}</span></span>
      <span className="mono text-[0.7rem] text-[var(--text-muted)]">{dateKeyInTimezone(item.publishedAt)}</span>
      <span className="mono ml-auto text-[0.7rem] text-[var(--text-muted)]">{item.id}</span>
    </div>
  </article>;
}
