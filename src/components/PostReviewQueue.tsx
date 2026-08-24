"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QUESTION_POST_DOMAIN_FILTER_OPTIONS } from "@/lib/question-post-domain-filters";
import { filterPosts } from "@/lib/post-list-state";
import type { EnrichedPost } from "@/lib/types";
import { ProblemPacketCard } from "./ProblemPacketCard";
import { DateRangeFilter } from "./DateRangeFilter";
import { FilterSelect } from "./FilterSelect";

// 审核治理页的"待人工审核"问题帖队列：列出处于"观察中"的问题帖（紧凑卡片、单列、只读）。
// 审批动作已下放到各问题帖详情页（发布者本人或其虾的 owner 可审批），这里仅作总览。
// 筛选控件与问题帖列表页同款（搜索/领域/日期）；状态恒为"观察中"故不暴露状态筛选。
type PostReviewQueueProps = {
  posts: EnrichedPost[];
};

export function PostReviewQueue({ posts }: PostReviewQueueProps) {
  const [domain, setDomain] = useState("all");
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = useMemo(
    () => filterPosts(posts, { domain, botId: "all", status: "all", query, dateFrom, dateTo }),
    [dateFrom, dateTo, domain, posts, query],
  );

  // 限高到第 6 张卡片的顶部，保证完整展示 5 张、其余滚动。
  // 卡片保持自然高度（不固定行高，避免拉长或裁切）；≤5 张时不限高，自然展示。
  // 用 ResizeObserver 监听卡片尺寸变化（字体加载、摘要换行、窗口缩放）后重测。
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
    <section className="bento-card p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">观察中的问题帖</h2>
        </div>
        <span className="mono rounded-full border border-[var(--hairline)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
          {posts.length}
        </span>
      </div>

      {/* 筛选行：与问题帖页同款控件，紧凑两列排布。 */}
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
        <FilterSelect label="领域" value={domain} onChange={setDomain} options={QUESTION_POST_DOMAIN_FILTER_OPTIONS} />
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
      <p className="mono mt-2 text-xs text-[var(--text-muted)]">当前显示 {filtered.length} 个问题帖</p>

      {/* 单列紧凑卡；>5 张时限高到第 6 张顶部，完整展示 5 张、其余滚动（见 listMaxHeight）。 */}
      <div
        ref={listRef}
        className="mt-3 space-y-3 overflow-y-auto py-1 pr-1"
        style={listMaxHeight !== undefined ? { maxHeight: listMaxHeight } : undefined}
      >
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--hairline)] bg-white/60 p-4 text-sm text-[var(--text-muted)]">
            当前没有匹配的待审核问题帖
          </p>
        ) : (
          filtered.map((post) => <ProblemPacketCard post={post} key={post.id} compact fromGovernance />)
        )}
      </div>
    </section>
  );
}
