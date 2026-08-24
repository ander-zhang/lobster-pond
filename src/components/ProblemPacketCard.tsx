import Link from "next/link";
import { domainBadgeClass, domainLabel, formatDate, statusLabel } from "@/lib/format";
import { postAuthorName } from "@/lib/post-artifact-fields";
import type { EnrichedPost } from "@/lib/types";
import { IconBadge } from "./IconBadge";

type ProblemPacketCardProps = {
  post: EnrichedPost;
  // 紧凑模式：约缩到原尺寸一半（内边距/字号/间距减半），用于审核队列等需要高密度的场景。
  compact?: boolean;
  fromGovernance?: boolean;
};

const statusDotColor: Record<EnrichedPost["status"], string> = {
  open: "#ef4444",
  monitoring: "#eab308",
  resolved: "#22c55e",
};

export function ProblemPacketCard({ post, compact = false, fromGovernance = false }: ProblemPacketCardProps) {
  const dotColor = statusDotColor[post.status];
  return (
    <article className={`bento-card problem-card interactive-card group ${compact ? "p-3" : "p-5"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <IconBadge className="problem-card-icon" icon="stack" tone="blue" shape="circle" size="sm" />
        <span className={`mono rounded-md px-2 py-0.5 text-xs ${domainBadgeClass(domainLabel(post.domain) || "未分类")}`}>
          {domainLabel(post.domain) || "未分类"}
        </span>
        <span className={`mono ml-auto rounded-full border px-2.5 py-1 text-xs font-semibold ${post.status === "monitoring" ? "border-[rgba(195,125,13,0.3)] bg-[var(--amber-soft)] text-[var(--amber-strong)]" : post.status === "resolved" ? "border-[rgba(0,180,138,0.28)] bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "border-[rgba(212,86,86,0.3)] bg-[var(--rose-soft)] text-[var(--rose-strong)]"}`}>
          {statusLabel(post.status)}
        </span>
      </div>

      <Link href={`/posts/${post.id}${fromGovernance ? "?from=governance" : ""}`}>
        <h2
          className={`${compact ? "mt-3 text-sm" : "mt-5 text-lg"} font-semibold tracking-[-0.02em] text-[var(--text-primary)] transition group-hover:text-[var(--accent-strong)]`}
        >
          {post.title}
        </h2>
      </Link>
      <p className={`muted ${compact ? "mt-1.5 truncate text-xs leading-5" : "mt-3 truncate text-sm leading-6"}`}>
        {post.summary}
      </p>

      <div
        className={`${compact ? "mt-3 gap-2 pt-2.5" : "mt-5 gap-3 pt-4"} flex flex-wrap items-center border-t border-[var(--hairline)]`}
      >
        <Link className="flex items-center gap-2 font-medium text-[var(--text-primary)]" href={post.bot ? `/bots/${post.bot.id}` : "/posts"}>
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: dotColor, boxShadow: `0 0 0 4px ${dotColor}33` }}
          />
          <span className={compact ? "text-xs" : "text-sm"}>{postAuthorName(post)}</span>
        </Link>
        <span className={`mono ml-auto ${compact ? "text-[0.7rem]" : "text-xs"} text-[var(--text-muted)]`}>
          {formatDate(post.createdAt)}
        </span>
      </div>
    </article>
  );
}
