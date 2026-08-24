"use client";

import { useEffect, useRef, useState } from "react";

// 占比横条：把多类内容的数量占比并排成一条堆叠条，直接读出"谁多谁少、
// 谁该优先"。用于治理页状态分桶对比、库页"可正式使用 / 总数"对比。
// 单段时退化为普通进度条；多段时按比例铺满，每段独立增长以制造节奏感。

export type RatioSegment = {
  /** 数值（非负）。 */
  value: number;
  /** 段背景色（CSS 颜色或变量）。 */
  color: string;
  /** 图例标签。 */
  label: string;
};

type RatioBarProps = {
  segments: RatioSegment[];
  /** 条高 px，默认 10。 */
  height?: number;
  /** 是否圆角，默认 true。 */
  rounded?: boolean;
};

export function RatioBar({ segments, height = 10, rounded = true }: RatioBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  // prefers-reduced-motion 下直接渲染终值，避免 effect 里同步 setState。
  const [revealed, setRevealed] = useState(prefersReducedMotion);
  const total = segments.reduce((sum, seg) => sum + Math.max(0, seg.value), 0);

  useEffect(() => {
    if (total === 0 || prefersReducedMotion) {
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [total, prefersReducedMotion]);

  return (
    <div
      className="ratio-bar w-full overflow-hidden bg-[var(--surface-2)]"
      ref={ref}
      role="img"
      style={{ height, borderRadius: rounded ? 999 : 0 }}
    >
      {total === 0 ? (
        <div className="h-full w-full bg-[var(--surface-2)]" />
      ) : (
        <div className="flex h-full w-full">
          {segments.map((seg, index) => {
            const width = (Math.max(0, seg.value) / total) * 100;
            if (width <= 0) {
              return null;
            }
            // 阶梯延迟：相邻段错开 90ms，制造"依次填充"的节奏。
            const delay = revealed ? index * 90 : 0;
            return (
              <div
                aria-hidden
                className="h-full"
                key={seg.label}
                style={{
                  width: `${width}%`,
                  background: seg.color,
                  transformOrigin: "left center",
                  transform: revealed ? "scaleX(1)" : "scaleX(0)",
                  transition: "transform 620ms cubic-bezier(0.16, 1, 0.3, 1)",
                  transitionDelay: `${delay}ms`,
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// 单段进度条：用于"已正式使用 N / 总数 M"这类单比率。比多段更克制。
type ProgressBarProps = {
  /** 0–100。 */
  value: number;
  color?: string;
  height?: number;
  rounded?: boolean;
};

export function ProgressBar({
  value,
  color = "var(--accent)",
  height = 8,
  rounded = true,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [revealed, setRevealed] = useState(prefersReducedMotion);

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  return (
    <div
      className="w-full overflow-hidden bg-[var(--surface-2)]"
      ref={ref}
      role="img"
      style={{ height, borderRadius: rounded ? 999 : 0 }}
    >
      <div
        className="h-full"
        style={{
          width: revealed ? `${clamped}%` : 0,
          background: color,
          borderRadius: rounded ? 999 : 0,
          transition: "width 700ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />
    </div>
  );
}
