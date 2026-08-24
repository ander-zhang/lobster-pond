import type { Bot, ContentState, MarkdownDoc } from "./types.ts";
import { contentStateFormalUse } from "./format.ts";
import { docAuthorName } from "./doc-author-name.ts";

// 审核治理视图的数据模型（帮助文档 §14 / §15）。把内容按状态分桶，
// 区分"需人工审核"，并计算治理指标。

export type GovernanceItem = {
  id: string;
  kind: "knowledge" | "skills";
  title: string;
  summary: string;
  state: ContentState;
  href: string;
  domain: string;
  // 版本号（与详情页头部版本标签同源）；未编号为 null。
  version: string | null;
  // 发布时间（DB docs.created_at；本地回退路径无 created_at 时退回 updatedAt）。
  publishedAt: string;
  // 发布者署名：虾发布的文档（ownerBotIds）→ 虾名；Web 用户发布 → 用户名；历史/种子文档无主 → null。
  authorName: string | null;
  // 关联虾（doc.ownerBotIds），用于审核队列按虾筛选。
  ownerBotIds: string[];
  // 触发人工审核的原因（仅审核队列用）。
  reasons?: string[];
};

export type GovernanceBucket = {
  key: string;
  title: string;
  description: string;
  tone: "review";
  items: GovernanceItem[];
};

export type GovernanceMetric = {
  label: string;
  value: string;
  detail: string;
};

export type GovernanceView = {
  buckets: GovernanceBucket[];
  // 文档完整治理集合，供复盘中混合队列按 Reviewing 状态取用。
  items: GovernanceItem[];
  metrics: GovernanceMetric[];
};

function docHref(doc: MarkdownDoc) {
  return `/library/${doc.type}/${doc.id}`;
}

// 触发人工审核的原因：仅保留"替代旧版本"这类结构性原因。
// 证据来源等元数据均已不作为审核触发项（Needs Attention 单列处理）。
export function buildGovernanceView(
  docs: MarkdownDoc[],
  // userId -> username，用于派生 item.authorName；不传则发布者均按未署名处理。
  usernames: Map<string, string> = new Map(),
  // botId -> bot，用于虾发布的文档优先展示虾名。
  botsById: Map<string, Bot> = new Map(),
): GovernanceView {
  const docItems: GovernanceItem[] = docs.map((doc) => ({
    id: doc.id,
    kind: doc.type,
    title: doc.title,
    summary: doc.summary,
    state: doc.contentState,
    href: docHref(doc),
    domain: (doc.type === "knowledge" ? doc.domain : doc.scenario) ?? "其他",
    version: doc.version,
    publishedAt: doc.createdAt ?? doc.updatedAt,
    authorName: docAuthorName(doc, botsById, usernames, null) ?? null,
    ownerBotIds: doc.ownerBotIds,
    reasons: doc.contentState === "Needs Attention"
      ? ["已批准内容收到新评论，等待发布者确认是否需要更新。"]
      : [],
  }));

  const all = docItems;

  const inStates = (states: ContentState[]) => all.filter((item) => states.includes(item.state));

  const buckets: GovernanceBucket[] = [
    {
      key: "needs-review",
      title: "待人工复审",
      description: "敏感或与已有知识冲突的内容必须经人工审核后才能发布（§14）。",
      tone: "review",
      items: inStates(["Needs Review"]),
    },
    {
      key: "needs-attention",
      title: "待留意",
      description: "已批准内容收到新评论，等待发布者确认是否需要更新。",
      tone: "review",
      items: inStates(["Needs Attention"]),
    },
  ];

  const formalDocs = docs.filter((doc) => contentStateFormalUse(doc.contentState) === "yes").length;
  const needsReview = buckets.find((bucket) => bucket.key === "needs-review")?.items.length ?? 0;

  const metrics: GovernanceMetric[] = [
    {
      label: "正式可用知识",
      value: String(formalDocs),
      detail: `Approved 状态的条目，共 ${docs.length} 条文档`,
    },
    {
      label: "待人工复审",
      value: String(needsReview),
      detail: "需要人工审核才能发布的内容数量",
    },
  ];

  return { buckets, items: all, metrics };
}
