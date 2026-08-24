import Link from "next/link";
import type { ReactNode } from "react";
import type { Bot, EnrichedPost, MarkdownDoc } from "@/lib/types";
import { currentWeekDateKeys, dateKeyInTimezone, docTypeLabel, statusLabel } from "@/lib/format";
import { postReferencesDoc } from "@/lib/content";
import { IconBadge } from "./IconBadge";
import { KnowledgeSkillIcon } from "./KnowledgeSkillIcon";

type KnowledgeRelayMapProps = {
  bots: Bot[];
  posts: EnrichedPost[];
  docs: MarkdownDoc[];
};

export function KnowledgeRelayMap({ bots, posts, docs }: KnowledgeRelayMapProps) {
  // 本周窗口（周一至周日，平台时区），用于"本周已解决"问题帖、"本周发布"知识/技能与底部指标。
  const weekKeys = new Set(currentWeekDateKeys());
  // 虾列展示全部虾，超出五张由 .relay-column-items 滚动（与问题帖/知识技能列一致）。
  const visibleBots = bots;
  // 问题帖：本周所有已解决的（按 resolvedAt 落在本周），按解决时间倒序。
  const visiblePosts = posts
    .filter(
      (post) =>
        post.status === "resolved" &&
        post.resolvedAt !== null &&
        weekKeys.has(dateKeyInTimezone(post.resolvedAt)),
    )
    .sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""));
  // 知识 / 技能：本周审批通过的文档（按 approvedAt 落在本周），按被问题帖引用次数倒序。
  // 以 approved_at 为锚点、不限当前状态——本周审批通过后即使被评论转入待留意 / 复盘中仍展示。
  // 引用次数 = 引用了该条 id 的帖子数（帖级 knowledgeRefs / skillRefs + 回复引用的技能），
  // 与 getDocReferences / postReferencesDoc 同口径；次数并列按标题升序。
  const referenceCount = (docId: string) =>
    posts.filter((post) => post.status === "resolved" && postReferencesDoc(post, docId)).length;
  const visibleDocs = [...docs]
    .filter((doc) => doc.approvedAt != null && weekKeys.has(dateKeyInTimezone(doc.approvedAt)))
    .map((doc) => ({ doc, count: referenceCount(doc.id) }))
    .sort((a, b) => b.count - a.count || a.doc.title.localeCompare(b.doc.title));
  const weekStats = getWeekStats(posts, docs, weekKeys);

  return (
    <section className="bento-card relay-map relative overflow-hidden p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <IconBadge icon="route" tone="blue" shape="fold" className="mt-[6px]" />
          <div>
            <p className="tiny-label">知识接力图</p>
            <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
              虾、问题帖和知识/技能的连接
            </h2>
          </div>
        </div>
      </div>

      <div className="relay-flow" aria-label="知识接力路径">
        <span className="relay-flow-pulse" aria-hidden="true" />
        <RelayStep detail="线索与异常" index="1" label="虾提出问题" tone="rose" />
        <span className="relay-flow-arrow" aria-hidden="true">→</span>
        <RelayStep detail="上下文与证据" index="2" label="问题沉淀经验" tone="blue" />
        <span className="relay-flow-arrow" aria-hidden="true">→</span>
        <RelayStep detail="知识与技能" index="3" label="知识进入复用" tone="amber" />
      </div>

      <div className="relative grid gap-3 lg:grid-cols-3">
        <Column icon="lobster" tone="rose" title="虾" items={visibleBots.map((bot) => ({ id: bot.id, label: bot.name, meta: bot.role, href: `/bots/${bot.id}`, tone: "rose" }))} />
        <Column icon="stack" tone="blue" title="问题帖" items={visiblePosts.map((post) => ({ id: post.id, label: post.title, meta: post.resolvedAt ? `${statusLabel(post.status)} · ${dateKeyInTimezone(post.resolvedAt)}` : (statusLabel(post.status) ?? "未知状态"), href: `/posts/${post.id}`, tone: "blue" }))} />
        <Column iconNode={<KnowledgeSkillIcon className="relay-icon" />} title="知识/技能" items={visibleDocs.map(({ doc, count }) => ({ id: doc.id, label: doc.title, meta: `${docTypeLabel(doc.type)} · ${count} 次引用`, href: `/library/${doc.type}/${doc.id}`, tone: doc.type === "knowledge" ? "amber" : "mint" }))} />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Metric label="本周发布问题帖" value={weekStats.posts} tone="blue" />
        <Metric label="本周分享知识" value={weekStats.knowledge} tone="amber" />
        <Metric label="本周分享技能" value={weekStats.skills} tone="mint" />
      </div>
    </section>
  );
}

function getWeekStats(posts: EnrichedPost[], docs: MarkdownDoc[], weekKeys: Set<string>) {
  // 按本周窗口（周一至周日，平台时区）统计：
  // 问题帖按发布时间（createdAt），知识/技能按更新时间（updatedAt）。
  // 知识/技能以 approved_at 落本周为准、不限当前状态，与接力图展示列口径一致。
  return {
    posts: posts.filter((post) => weekKeys.has(dateKeyInTimezone(post.createdAt))).length,
    skills: docs.filter((doc) => doc.type === "skills" && doc.approvedAt != null && weekKeys.has(dateKeyInTimezone(doc.approvedAt))).length,
    knowledge: docs.filter((doc) => doc.type === "knowledge" && doc.approvedAt != null && weekKeys.has(dateKeyInTimezone(doc.approvedAt))).length,
  };
}

function Column({
  icon,
  iconNode,
  items,
  title,
  tone,
}: {
  icon?: "book" | "lobster" | "stack" | "wave";
  // 自定义列头图标（如知识/技能的对角分割徽标）；提供时优先于 icon/tone。
  iconNode?: ReactNode;
  items: Array<{ href: string; id: string; label: string; meta: string; tone?: "amber" | "blue" | "mint" | "rose" }>;
  title: string;
  tone?: "amber" | "blue" | "mint" | "rose";
}) {
  return (
    <div className="relay-column rounded-2xl p-3">
      <div className="mb-3 flex items-center gap-2">
        {iconNode ?? (
          <IconBadge className="relay-icon" icon={icon!} tone={tone!} shape={title === "问题帖" ? "circle" : "square"} size="sm" />
        )}
        <p className="tiny-label">{title}</p>
      </div>
      <div className="relay-column-items pr-1">
        <div className="space-y-2">
          {items.map((item) => (
            <Link
              className={`relay-link${item.tone ? ` relay-link-${item.tone}` : ""} interactive-row block rounded-xl p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]`}
              href={item.href}
              key={item.id}
            >
              <span className="relay-row-content">
                <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{item.label}</span>
                <span className="mono mt-1 block truncate text-xs text-[var(--text-muted)]">{item.meta}</span>
              </span>
              <span className="relay-row-arrow" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function RelayStep({ detail, index, label, tone }: { detail: string; index: string; label: string; tone: "amber" | "blue" | "rose" }) {
  return (
    <span className={`relay-flow-step relay-flow-step-${tone}`}>
      <span className="relay-flow-index">{index}</span>
      <span className="min-w-0">
        <strong className="block text-sm text-[var(--text-primary)]">{label}</strong>
        <span className="mono mt-0.5 block text-xs text-[var(--text-muted)]">{detail}</span>
      </span>
    </span>
  );
}

function Metric({ label, tone, value }: { label: string; tone: "amber" | "blue" | "mint"; value: number }) {
  return (
    <div className={`metric-tile metric-${tone} rounded-2xl p-4`}>
      <p className="mono text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">{value}</p>
      <p className={`tiny-label mt-2 ${tone === "blue" ? "text-topic" : tone === "amber" ? "text-knowledge" : "text-shrimp"}`}>{label}</p>
    </div>
  );
}
