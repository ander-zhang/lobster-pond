"use client";

import { useEffect, useRef, useState } from "react";

// SVG 环形进度。用于把"占比/完成率"这类关键比率从纯数字升级为图形，
// 让一眼就能读出比例大小（强化信息对比）。进入视口时弧线从 0 增长到目标值。
//
// 动效：IntersectionObserver 触发一次性增长，prefers-reduced-motion 下直接显示终值。

type ProgressRingProps = {
  /** 0–100。 */
  value: number;
  /** 弧线颜色，默认品牌薄荷绿。 */
  color?: string;
  /** 轨道颜色，默认 hairline。 */
  trackColor?: string;
  /** 直径 px。 */
  size?: number;
  /** 描边粗细 px。 */
  stroke?: number;
  /** 中心主文字（通常是百分比或计数）。 */
  label?: string;
  /** 中心副文字（说明）。 */
  caption?: string;
};

export function ProgressRing({
  value,
  color = "var(--accent)",
  trackColor = "var(--hairline)",
  size = 84,
  stroke = 8,
  label,
  caption,
}: ProgressRingProps) {
  const ref = useRef<SVGSVGElement>(null);
  const clamped = Math.max(0, Math.min(100, value));
  // prefers-reduced-motion 时直接渲染终值，避免在 effect 里同步 setState
  // （react-hooks/set-state-in-effect）。初始化器只在客户端首渲时求值一次，
  // SSR 下默认 0 再由 effect 异步揭示。
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [shown, setShown] = useState(prefersReducedMotion ? clamped : 0);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (shown / 100) * circumference;

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
            // 进入视口后用一次短缓动增长到目标值，节奏与项目其它动效（140–220ms）一致。
            setShown(clamped);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, clamped, prefersReducedMotion]);

  const showText = Boolean(label || caption);

  return (
    <div
      className="relative inline-grid place-items-center"
      style={{ width: size, height: size }}
    >
      <svg
        height={size}
        ref={ref}
        role="img"
        style={{ transform: "rotate(-90deg)" }}
        viewBox={`0 0 ${size} ${size}`}
        width={size}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke={trackColor}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeWidth={stroke}
          style={{
            transition: "stroke-dashoffset 700ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </svg>
      {showText ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
          {label ? (
            <span className="mono text-[0.95rem] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
              {label}
            </span>
          ) : null}
          {caption ? (
            <span className="mt-0.5 max-w-[80%] text-[0.65rem] leading-tight text-[var(--text-muted)]">
              {caption}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
