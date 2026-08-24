"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { GovernanceItem } from "@/lib/governance";
import type { Bot } from "@/lib/types";
import { dateKeyInTimezone, domainBadgeClass, domainLabel } from "@/lib/format";
import { StateBadge } from "./StateBadge";
import { IconBadge } from "./IconBadge";
import { DateRangeFilter } from "./DateRangeFilter";
import { FilterSelect } from "./FilterSelect";

// 审核治理页的"待审核的知识/技能"队列：列出处于 Needs Review 的文档（§14）。
// 与"观察中的问题帖"队列并排展示，但独立成卡，互不合并。
// 筛选控件为搜索/类别/日期（领域下拉已移除，与"观察中的问题帖"不再同款）；状态恒为待审核故不暴露状态筛选。
type ReviewItemQueueProps = {
  items: GovernanceItem[];
  bots: Bot[];
  title?: string;
  itemLabel?: string;
};

const KIND_LABEL: Record<GovernanceItem["kind"], string> = {
  knowledge: "知识",
  skills: "技能",
};

export function ReviewItemQueue({ items, bots, title = "待审核的知识/技能", itemLabel = "待审核" }: ReviewItemQueueProps) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // 仅保留实际关联到至少一条待审核文档的虾，供搜索框按虾名匹配（虾下拉筛选已移除）。
  const ownerBots = useMemo(() => {
    const ownerIds = new Set(items.flatMap((item) => item.ownerBotIds));
    const botsById = new Map(bots.map((bot) => [bot.id, bot] as const));
    return Array.from(ownerIds)
      .map((id) => botsById.get(id))
      .filter((bot): bot is Bot => bot !== undefined);
  }, [items, bots]);

  const botNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const bot of ownerBots) {
      map.set(bot.id, bot.name);
    }
    return map;
  }, [ownerBots]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const botNames = item.ownerBotIds.map((id) => botNameById.get(id) ?? "").join(" ");
      const matchesQuery =
        !q ||
        [item.title, item.summary, item.id, item.authorName ?? "", botNames].some((value) =>
          value.toLowerCase().includes(q),
        );
      const matchesKind = kind === "all" || item.kind === kind;
      const postDate = dateKeyInTimezone(item.publishedAt);
      const matchesDate = (!dateFrom || postDate >= dateFrom) && (!dateTo || postDate <= dateTo);
      return matchesQuery && matchesKind && matchesDate;
    });
  }, [botNameById, dateFrom, dateTo, items, kind, query]);

  // 限高到第 6 张卡片的顶部，保证完整展示 5 张、其余滚动（与"观察中的问题帖"队列同款）。
  // 卡片保持自然高度；≤5 张时不限高，自然展示。ResizeObserver 监听卡片尺寸变化后重测。
  const listRef = useRef<HTMLDivElement>(null);
  const [listMaxHeight, setListMaxHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => {
      const cards = Array.from(el.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement,
      );
      if (cards.length > 5) {
        const containerTop = el.getBoundingClientRect().top;
        const sixthTop = cards[5].getBoundingClientRect().top;
        setListMaxHeight(Math.max(0, sixthTop - containerTop));
      } else {
        setListMaxHeight(undefined);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const child of el.children) {
      if (child instanceof HTMLElement) ro.observe(child);
    }
    return () => ro.disconnect();
  }, [filtered]);

  return (
    <section className="bento-card self-start p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">{title}</h2>
        </div>
        <span className="mono rounded-full border border-[var(--hairline)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
          {items.length}
        </span>
      </div>

      {/* 筛选行：搜索整行，类别 + 日期 同行（领域下拉已移除）。 */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <label className="col-span-2 block">
          <span className="tiny-label">搜索</span>
          <input
            className="mt-2 w-full rounded-xl border border-[var(--hairline)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] shadow-[0_8px_18px_rgba(42,67,101,0.06)]"
            placeholder="标题、摘要、虾、用户名"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <FilterSelect
          label="类别"
          value={kind}
          onChange={setKind}
          options={[
            { value: "knowledge", label: "知识" },
            { value: "skills", label: "技能" },
          ]}
        />
        <div className="block">
          <span className="tiny-label">日期</span>
          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={({ dateFrom: from, dateTo: to }) => {
              setDateFrom(from);
              setDateTo(to);
            }}
          />
        </div>
      </div>
      <p className="mono mt-2 text-xs text-[var(--text-muted)]">当前显示 {filtered.length} 个{itemLabel}条目</p>

      <div
        ref={listRef}
        className="mt-3 space-y-3 overflow-y-auto py-1 pr-1"
        style={listMaxHeight !== undefined ? { maxHeight: listMaxHeight } : undefined}
      >
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--hairline)] bg-white/60 p-4 text-sm text-[var(--text-muted)]">
            当前没有匹配的{itemLabel}知识/技能
          </p>
        ) : (
          filtered.map((item) => {
            // 技能卡走专属预览样式：薄荷绿 spark 图标、单行摘要、无发布者圆点、薄荷浅染底。
            // 知识卡同款范式但改琥珀主题：book 图标琥珀色、琥珀浅染底。
            const isSkill = item.kind === "skills";
            return (
            <article
              className={`bento-card problem-card interactive-card group p-3${isSkill ? " skill-preview-card" : " knowledge-preview-card"}`}
              key={`${item.kind}-${item.id}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <IconBadge
                  className="problem-card-icon"
                  icon={isSkill ? "spark" : "book"}
                  tone={isSkill ? "mint" : "amber"}
                  shape="circle"
                  size="sm"
                />
                <span className="mono rounded-md border border-[var(--hairline)] bg-white px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                  {KIND_LABEL[item.kind]}
                </span>
                {item.domain ? (
                  <span className={`mono rounded-md px-2 py-0.5 text-xs ${domainBadgeClass(item.domain)}`}>
                    {domainLabel(item.domain)}
                  </span>
                ) : null}
                <StateBadge state={item.state} size="sm" className="ml-auto" />
              </div>

              <Link href={`${item.href}?from=governance`}>
                <h2 className="mt-3 text-sm font-semibold tracking-[-0.02em] text-[var(--text-primary)] transition group-hover:text-[var(--accent-strong)]">
                  {item.title}
                </h2>
              </Link>
              {item.reasons && item.reasons.length > 0 ? (
                <ul className="mt-1.5 space-y-0.5">
                  {item.reasons.map((reason) => (
                    <li className="flex gap-1 text-xs leading-5 text-[var(--amber-strong)]" key={reason}>
                      <span aria-hidden>•</span>
                      {reason}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted mt-1.5 truncate text-xs leading-5">
                  {item.summary}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] pt-2.5">
                <span className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
                  <span className="text-xs">{item.authorName ?? "未署名"}</span>
                </span>
                <span className="mono text-[0.7rem] text-[var(--text-muted)]">
                  {dateKeyInTimezone(item.publishedAt)}
                </span>
                <span className="mono ml-auto text-[0.7rem] text-[var(--text-muted)]">{item.id}</span>
              </div>
            </article>
            );
          })
        )}
      </div>
    </section>
  );
}
