"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EnrichedPost } from "@/lib/types";
import { dateKeyInTimezone, todayKey } from "@/lib/format";
import { ProgressRing } from "./ProgressRing";

type PostStatsCardProps = {
  posts: EnrichedPost[];
};

// 平台运营时区（与 format.ts 一致）。
const TZ = "Asia/Shanghai";

// 计算当月第 1 天的日期键（YYYY-MM-DD），如 "2026-06-01"。
function monthStartKey(timeZone = TZ): string {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}-01`;
}

// 计算本周一（ISO 周一）的日期键。
function weekStartKey(timeZone = TZ): string {
  const now = new Date();
  // 在 Asia/Shanghai 下拿到当前是周几（0=Sun…6=Sat），ISO 周一=1。
  const dow = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(now);
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const todayDow = dayMap[dow] ?? 1;
  // ISO 周一偏移：若今天是周日(0)则回退 6 天，否则回退 (todayDow-1) 天。
  const offset = todayDow === 0 ? 6 : todayDow - 1;
  const monday = new Date(now.getTime() - offset * 86_400_000);
  return dateKeyInTimezone(monday, timeZone);
}

type StatBucket = {
  label: string;
  count: number;
  tone: "blue" | "mint" | "amber" | "rose";
  detail: string;
};

export function PostStatsCard({ posts }: PostStatsCardProps) {
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [revealed, setRevealed] = useState(prefersReducedMotion);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  const today = todayKey(TZ);
  const weekStart = weekStartKey(TZ);
  const monthStart = monthStartKey(TZ);

  const { todayCount, weekCount, monthCount, totalCount } = useMemo(() => {
    let tc = 0;
    let wc = 0;
    let mc = 0;
    const total = posts.length;
    for (const post of posts) {
      const dk = dateKeyInTimezone(post.createdAt, TZ);
      if (dk === today) tc++;
      if (dk >= weekStart) wc++;
      if (dk >= monthStart) mc++;
    }
    return { todayCount: tc, weekCount: wc, monthCount: mc, totalCount: total };
  }, [posts, today, weekStart, monthStart]);

  const buckets: StatBucket[] = useMemo(
    () => [
      {
        label: "当日",
        count: todayCount,
        tone: "rose",
        detail: "今天发布的问题帖数量",
      },
      {
        label: "当周",
        count: weekCount,
        tone: "blue",
        detail: "本周一至今发布的问题帖",
      },
      {
        label: "当月",
        count: monthCount,
        tone: "amber",
        detail: "本月 1 日至今发布的问题帖",
      },
      {
        label: "总计",
        count: totalCount,
        tone: "mint",
        detail: "平台全部问题帖总数",
      },
    ],
    [todayCount, weekCount, monthCount, totalCount],
  );

  // 环形进度：当日占当月的比率，展示发布节奏。
  const todayMonthPct = monthCount > 0 ? Math.round((todayCount / monthCount) * 100) : 0;

  return (
    <div ref={ref} className="mt-6">
      <p className="tiny-label text-[var(--text-secondary)]">发布统计</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {buckets.map((bucket, index) => (
          <div
            className={`metric-tile metric-${bucket.tone} interactive-tile rounded-xl p-3.5`}
            key={bucket.label}
            style={{
              opacity: revealed ? 1 : 0,
              transform: revealed ? "translateY(0)" : "translateY(8px)",
              transition: `opacity 400ms var(--ease-out) ${index * 70}ms, transform 400ms var(--ease-out) ${index * 70}ms`,
            }}
          >
            <p className="metric-value mono text-2xl font-semibold tracking-[-0.02em]">
              {bucket.count}
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
              {bucket.label}
            </p>
            <p className="mt-0.5 text-xs leading-4 text-[var(--text-muted)]">
              {bucket.detail}
            </p>
          </div>
        ))}
      </div>

      {/* 当日/当月比率环形：一眼读出"今天是否在积极发布"。 */}
      <div className="mt-4 flex items-center gap-4 rounded-xl border border-[var(--hairline)] bg-white/78 p-4">
        <ProgressRing
          caption="当日/当月"
          color="var(--accent-strong)"
          label={`${todayMonthPct}%`}
          size={68}
          stroke={7}
          trackColor="var(--surface-3)"
          value={todayMonthPct}
        />
        <div className="min-w-0">
          <p className="mono text-lg font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
            {todayCount}
            <span className="text-sm font-medium text-[var(--text-muted)]">
              {" "}
              / {monthCount} 当日占当月
            </span>
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
            今日发布量占本月总量的比例，反映当前发布活跃度。
          </p>
        </div>
      </div>
    </div>
  );
}
