"use client";

import { useEffect, useRef, useState } from "react";

type AnimatedCountProps = {
  value: number;
  /** 动画时长（ms），默认 900。 */
  duration?: number;
};

/**
 * 进入视口时用 requestAnimationFrame 从 0 数到目标值。
 * prefers-reduced-motion 下直接显示终态，不播动画。
 * 无障碍：动态数字用 aria-hidden 隐藏，sr-only span 始终持有终值。
 */
export function AnimatedCount({ value, duration = 900 }: AnimatedCountProps) {
  // prefers-reduced-motion：直接显示终态，不注册 rAF、不进 effect，
  // 避免在 effect 内同步 setState 触发级联渲染。
  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReduced) {
    return (
      <span>
        <span aria-hidden="true">{value}</span>
        <span className="sr-only">{value}</span>
      </span>
    );
  }

  return <AnimatedCountActive value={value} duration={duration} />;
}

function AnimatedCountActive({ value, duration }: Required<AnimatedCountProps>) {
  const [displayed, setDisplayed] = useState(0);
  const [triggered, setTriggered] = useState(
    // 无 IntersectionObserver 的环境（SSR 兜底/极旧浏览器）直接进入动画分支。
    typeof IntersectionObserver === "undefined",
  );
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setTriggered(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!triggered) return;

    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(eased * value));
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
  }, [triggered, value, duration]);

  return (
    <span ref={ref}>
      {/* 动画数字：对屏幕阅读器隐藏，避免频繁播报中间值。 */}
      <span aria-hidden="true">{displayed}</span>
      {/* 无障碍终值：始终持有最终数字供 AT 读取。 */}
      <span className="sr-only">{value}</span>
    </span>
  );
}
