"use client";

import { useEffect, useRef, useState } from "react";

// 迷你水平条：把一个数值在 [min,max] 区间内的相对位置可视化成一小段条，
// 用于"引用次数""参与度"这类热度。条长按比例，颜色按热度档位变化。
// 比纯文字"N 次引用"更直观地读出热门/冷门，强化列表内对比。

type HeatBarProps = {
  /** 当前值。 */
  value: number;
  /** 区间下界，默认 0。 */
  min?: number;
  /** 区间上界（必填，用于计算比例）。 */
  max: number;
  /** 条高 px，默认 5。 */
  height?: number;
  /** 是否显示右侧数值，默认 true。 */
  showValue?: boolean;
  /** 数值后缀文字，如" 次引用"。 */
  suffix?: string;
};

export function HeatBar({ value, min = 0, max, height = 5, showValue = true, suffix = "" }: HeatBarProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [revealed, setRevealed] = useState(prefersReducedMotion);
  const span = Math.max(1, max - min);
  const ratio = Math.max(0, Math.min(1, (value - min) / span));

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
    <span className="inline-flex items-center gap-2" ref={ref}>
      <span
        aria-hidden
        className="inline-block overflow-hidden rounded-full bg-[var(--surface-2)]"
        style={{ height, width: 56 }}
      >
        <span
          className="block h-full rounded-full"
          style={{
            width: revealed ? `${ratio * 100}%` : 0,
            background: "linear-gradient(90deg, var(--accent), var(--blue))",
            transition: "width 600ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </span>
      {showValue ? (
        <span className="mono text-xs text-[var(--text-muted)]">
          {value}
          {suffix}
        </span>
      ) : null}
    </span>
  );
}
