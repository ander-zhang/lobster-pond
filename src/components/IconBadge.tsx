import type { CSSProperties } from "react";

type IconName = "book" | "check" | "comment" | "filter" | "lobster" | "message" | "route" | "spark" | "stack" | "tricolor-wave" | "wave";
type IconTone = "amber" | "blue" | "mint" | "rose";
type IconShape = "circle" | "fold" | "round" | "square";

type IconBadgeProps = {
  icon: IconName;
  tone?: IconTone;
  shape?: IconShape;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClass = {
  sm: "h-8 w-8",
  md: "h-11 w-11",
  lg: "h-14 w-14",
};

const shapeClass = {
  circle: "rounded-full",
  fold: "rounded-[18px] rotate-3",
  round: "rounded-2xl",
  square: "rounded-xl",
};

export function IconBadge({
  icon,
  tone = "blue",
  shape = "round",
  size = "md",
  className = "",
}: IconBadgeProps) {
  return (
    <span className={`icon-badge icon-${tone} ${sizeClass[size]} ${shapeClass[shape]} ${className}`} aria-hidden="true">
      <Icon name={icon} />
    </span>
  );
}

// 仅图标（无徽章底）：用于列表行首等需要小尺寸图标的场景。
// 尺寸由 className（如 h-4 w-4）控制，颜色由 style.color 控制（svg stroke = currentColor）。
export function TypeIcon({
  name,
  className = "",
  style,
}: {
  name: IconName;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span className={`type-icon ${className}`} style={style} aria-hidden="true">
      <Icon name={name} />
    </span>
  );
}

function Icon({ name }: { name: IconName }) {
  switch (name) {
    case "book":
      return (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v17H7.5A2.5 2.5 0 0 0 5 22V5.5Z" />
          <path d="M5 5.5A2.5 2.5 0 0 1 7.5 8H20" />
        </svg>
      );
    case "check":
      return (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 13 4 4L19 7" />
        </svg>
      );
    case "comment":
      // 文档详情页评论区同款 MessageCircle（lucide）单气泡评论图标。
      return (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" />
        </svg>
      );
    case "filter":
      return (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6h16" />
          <path d="M7 12h10" />
          <path d="M10 18h4" />
        </svg>
      );
    case "message":
      // 问题帖回复区同款双气泡回复图标（PostReplyPanel MessageIcon），填充式。
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M15.59 12.4V16.47C15.59 16.83 15.55 17.17 15.46 17.48C15.09 18.95 13.87 19.87 12.19 19.87H9.47L6.45 21.88C6 22.19 5.4 21.86 5.4 21.32V19.87C4.38 19.87 3.53 19.53 2.94 18.94C2.34 18.34 2 17.49 2 16.47V12.4C2 10.5 3.18 9.19 5 9.02C5.13 9.01 5.26 9 5.4 9H12.19C14.23 9 15.59 10.36 15.59 12.4Z" fill="currentColor" stroke="none" />
          <path d="M17.75 15.6C19.02 15.6 20.09 15.18 20.83 14.43C21.58 13.69 22 12.62 22 11.35V6.25C22 3.9 20.1 2 17.75 2H9.25C6.9 2 5 3.9 5 6.25V7C5 7.28 5.22 7.5 5.5 7.5H12.19C14.9 7.5 17.09 9.69 17.09 12.4V15.1C17.09 15.38 17.31 15.6 17.59 15.6H17.75Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "lobster":
      return (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 7.3c-2.2 0-3.6 1.8-3.6 4.6v3.3c0 2.6 1.6 4.6 3.6 4.6s3.6-2 3.6-4.6v-3.3c0-2.8-1.4-4.6-3.6-4.6Z" />
          <path d="M9 12h6" />
          <path d="M9.2 15.4h5.6" />
          <path d="M10.2 7.8 8.6 5.2 6.2 3.8" />
          <path d="m13.8 7.8 1.6-2.6 2.4-1.4" />
          <path d="M8.3 8.6 5.5 6.9 3.6 8.8" />
          <path d="m5.5 6.9-.4-2.2" />
          <path d="m5.5 6.9-2.1-.2" />
          <path d="m15.7 8.6 2.8-1.7 1.9 1.9" />
          <path d="m18.5 6.9.4-2.2" />
          <path d="m18.5 6.9 2.1-.2" />
          <path d="m8.4 12.2-2.2 1" />
          <path d="m15.6 12.2 2.2 1" />
          <path d="m8.6 15.2-2.1 1.4" />
          <path d="m15.4 15.2 2.1 1.4" />
          <path d="M10 20.1 8.5 22" />
          <path d="M12 20.3V22" />
          <path d="m14 20.1 1.5 1.9" />
        </svg>
      );
    case "route":
      return (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 6h3a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h7" stroke="var(--rose)" />
          <circle cx="6" cy="6" r="2" stroke="var(--amber)" />
          <circle cx="18" cy="18" r="2" stroke="var(--accent)" />
        </svg>
      );
    case "spark":
      return (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v4" />
          <path d="M12 17v4" />
          <path d="M3 12h4" />
          <path d="M17 12h4" />
          <path d="m6.3 6.3 2.8 2.8" />
          <path d="m14.9 14.9 2.8 2.8" />
          <path d="m17.7 6.3-2.8 2.8" />
          <path d="m9.1 14.9-2.8 2.8" />
        </svg>
      );
    case "stack":
      return (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m12 3 8 4-8 4-8-4 8-4Z" />
          <path d="m4 12 8 4 8-4" />
          <path d="m4 17 8 4 8-4" />
        </svg>
      );
    case "tricolor-wave":
      return (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7.2c2.7-4 5.4 4 8.1 0s5.4 4 7.9 0" stroke="var(--blue)" />
          <path d="M4 12c2.7-4 5.4 4 8.1 0s5.4 4 7.9 0" stroke="var(--amber)" />
          <path d="M4 16.8c2.7-4 5.4 4 8.1 0s5.4 4 7.9 0" stroke="var(--accent)" />
        </svg>
      );
    case "wave":
      return (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12c3-5 6 5 9 0s6 5 9 0" />
          <path d="M3 17c3-5 6 5 9 0s6 5 9 0" />
        </svg>
      );
  }
}
