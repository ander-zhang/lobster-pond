import type { ContentState } from "@/lib/types";
import {
  contentStateBadgeClass,
  contentStateFormalUse,
  contentStateLabel,
  contentStateMeaning,
} from "@/lib/format";

type StateBadgeProps = {
  state: ContentState;
  // 覆盖默认中文标签（默认取 contentStateLabel(state)）。用于在特定场景统一展示文案，
  // 例如知识库预览卡片把 Approved 统一显示为"已批准"。
  label?: string;
  // 是否同时显示英文状态名（如 "Approved"）。默认只显示中文标签。
  showRaw?: boolean;
  size?: "sm" | "md";
  // 追加到徽章的 class（如 py-1，用于与相邻标签胶囊等高）。
  className?: string;
};

// 内容状态徽章（帮助文档 §5）。颜色区分是否可正式使用：
// mint=可正式使用，blue/amber=流转中，rose=驳回，neutral=废弃/原始。
export function StateBadge({ state, label, showRaw = false, size = "md", className }: StateBadgeProps) {
  const text = label ?? contentStateLabel(state);
  return (
    <span
      className={`state-badge ${contentStateBadgeClass(state)} ${size === "sm" ? "px-2 py-0.5 text-[0.7rem]" : ""} ${className ?? ""}`}
      title={contentStateMeaning(state)}
      data-formal-use={contentStateFormalUse(state)}
    >
      {text}
      {/* 流转状态只显示中文短标签。 */}
      {showRaw && state !== "Needs Review" && state !== "Needs Attention" ? <span className="mono opacity-65">{state}</span> : null}
    </span>
  );
}
