"use client";

import { useRef, useState, useCallback, useEffect, type CSSProperties } from "react";
import "./LineSidebar.css";

// React Bits 的 LineSidebar 组件（TypeScript 移植）。
// 一条带刻度的纵向导航：鼠标靠近时，对应项的颜色 / 水平位移 / 刻度长度
// 由 rAF 驱动的指数平滑统一过渡（所有派生属性读同一个 --effect）。
// 源自 line sidebar.md 提供的 JS + CSS 变体。

type Falloff = "linear" | "smooth" | "sharp";

const FALLOFF_CURVES: Record<Falloff, (p: number) => number> = {
  linear: (p) => p,
  smooth: (p) => p * p * (3 - 2 * p),
  sharp: (p) => p * p * p,
};

const DEFAULT_ITEMS = [
  "Overview",
  "Components",
  "Animations",
  "Backgrounds",
  "Showcase",
  "Playground",
  "Templates",
  "Changelog",
  "Community",
  "Resources",
  "Documentation",
  "Support",
];

type LineSidebarProps = {
  items?: string[];
  accentColor?: string;
  textColor?: string;
  markerColor?: string;
  showIndex?: boolean;
  showMarker?: boolean;
  proximityRadius?: number;
  maxShift?: number;
  falloff?: Falloff;
  markerLength?: number;
  markerGap?: number;
  tickScale?: number;
  scaleTick?: boolean;
  itemGap?: number;
  fontSize?: number;
  smoothing?: number;
  defaultActive?: number | null;
  onItemClick?: (index: number, label: string) => void;
  className?: string;
};

export function LineSidebar({
  items = DEFAULT_ITEMS,
  accentColor = "#A855F7",
  textColor = "#c4c4c4",
  markerColor = "#6c6c6c",
  showIndex = true,
  showMarker = true,
  proximityRadius = 100,
  maxShift = 30,
  falloff = "smooth",
  markerLength = 60,
  markerGap = 0,
  tickScale = 0.5,
  scaleTick = true,
  itemGap = 20,
  fontSize = 1.1,
  smoothing = 100,
  defaultActive = null,
  onItemClick,
  className = "",
}: LineSidebarProps) {
  const listRef = useRef<HTMLUListElement | null>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const targetsRef = useRef<number[]>([]);
  const currentRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const activeRef = useRef(defaultActive);
  const smoothingRef = useRef(smoothing);
  const startLoopRef = useRef<() => void>(() => {});
  const [activeIndex, setActiveIndex] = useState(defaultActive);

  // 把会随渲染变化的值同步进 ref，供 rAF 循环每帧读取（不在渲染期写 ref）。
  useEffect(() => {
    activeRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    smoothingRef.current = smoothing;
  }, [smoothing]);

  // 单个 rAF 循环：用与帧率无关的指数平滑把每项的 --effect 朝目标值缓动，
  // 使颜色 / 位移 / 缩放同步过渡，避免 CSS transition 的错峰。
  // 循环体只读 ref，因此 [] 依赖即可保持最新；用命名函数声明避免自引用 TDZ 告警。
  useEffect(() => {
    function runFrame(now: number) {
      const dt = Math.min((now - lastRef.current) / 1000, 0.05);
      lastRef.current = now;
      const tau = Math.max(smoothingRef.current, 1) / 1000;
      const k = 1 - Math.exp(-dt / tau);

      let moving = false;
      const els = itemRefs.current;
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        if (!el) continue;
        const target = Math.max(targetsRef.current[i] || 0, activeRef.current === i ? 1 : 0);
        const cur = currentRef.current[i] || 0;
        const next = cur + (target - cur) * k;
        const settled = Math.abs(target - next) < 0.0015;
        const value = settled ? target : next;
        currentRef.current[i] = value;
        el.style.setProperty("--effect", value.toFixed(4));
        if (!settled) moving = true;
      }

      rafRef.current = moving ? requestAnimationFrame(runFrame) : null;
    }

    function startLoop() {
      if (rafRef.current != null) return;
      lastRef.current = performance.now();
      rafRef.current = requestAnimationFrame(runFrame);
    }

    startLoopRef.current = startLoop;

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLUListElement>) => {
      const list = listRef.current;
      if (!list) return;
      const rect = list.getBoundingClientRect();
      const pointerY = e.clientY - rect.top;
      const ease = FALLOFF_CURVES[falloff] ?? FALLOFF_CURVES.linear;
      const els = itemRefs.current;
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        if (!el) continue;
        const center = el.offsetTop + el.offsetHeight / 2;
        const distance = Math.abs(pointerY - center);
        targetsRef.current[i] = ease(Math.max(0, 1 - distance / proximityRadius));
      }
      startLoopRef.current();
    },
    [falloff, proximityRadius],
  );

  const handlePointerLeave = useCallback(() => {
    targetsRef.current = targetsRef.current.map(() => 0);
    startLoopRef.current();
  }, []);

  const handleClick = useCallback(
    (index: number, label: string) => {
      setActiveIndex(index);
      onItemClick?.(index, label);
    },
    [onItemClick],
  );

  // 选中项变化时唤醒循环，让新激活项的 --effect 平滑过渡到位。
  useEffect(() => {
    startLoopRef.current();
  }, [activeIndex]);

  const style = {
    "--accent-color": accentColor,
    "--text-color": textColor,
    "--marker-color": markerColor,
    "--marker-length": `${markerLength}px`,
    "--marker-gap": `${markerGap}px`,
    "--tick-scale": tickScale,
    "--max-shift": `${maxShift}px`,
    "--item-gap": `${itemGap}px`,
    "--font-size": `${fontSize}rem`,
    "--smoothing": `${smoothing}ms`,
  } as CSSProperties;

  return (
    <nav
      className={`line-sidebar${showMarker ? " line-sidebar--markers" : ""}${scaleTick ? " line-sidebar--scale-tick" : ""}${className ? ` ${className}` : ""}`}
      style={style}
    >
      <ul
        ref={listRef}
        className="line-sidebar__list"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        {items.map((label, index) => (
          <li
            key={`${label}-${index}`}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            className="line-sidebar__item"
          >
            {showMarker && <span className="line-sidebar__marker" aria-hidden="true" />}
            <button
              type="button"
              className="line-sidebar__button cursor-pointer border-0 bg-transparent p-0 text-left focus-visible:outline-2 focus-visible:outline-offset-4"
              style={{ outlineColor: accentColor }}
              aria-current={activeIndex === index ? "page" : undefined}
              onClick={() => handleClick(index, label)}
            >
              <span className="line-sidebar__label">
                {showIndex && (
                  <span className="line-sidebar__index">{String(index + 1).padStart(2, "0")}</span>
                )}
                <span className="line-sidebar__text">{label}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default LineSidebar;
