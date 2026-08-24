import type { Bot, EnrichedPost, MarkdownDoc } from "./types.ts";
import { getOptionalSql } from "./db.ts";
import { getBots, getDocs, getEnrichedPosts } from "./content.ts";

// 全站内容版本签名：把 6 张内容表（bots / posts / post_replies / docs /
// doc_comments / doc_download_counts）的计数、最新时间、状态分布压成一个
// 字符串。轮询器（content-version-poller.ts）每 5 秒算一次，变了才推 SSE。
// 注意 docs.updated_at 只存 YYYY-MM-DD（无时间），同日修订必须靠 revised_at
// （timestamptz，仅修订路径写入）分辨——签名必须含 max(revised_at)。

export type ContentVersionAggregate = {
  posts: { count: number; newestCreatedAt: string | null; open: number; monitoring: number; resolved: number; reviewed: number };
  replies: { count: number; newestCreatedAt: string | null };
  docs: {
    count: number;
    newestUpdatedAt: string | null;
    newestRevisedAt: string | null;
    approved: number;
    needsReview: number;
    needsAttention: number;
    reviewing: number;
    newestApprovedAt: string | null;
    newestRejectedAt: string | null;
    newestReviewTransferredAt: string | null;
  };
  comments: { count: number; newestCreatedAt: string | null };
  bots: { count: number };
  downloads: { total: number };
};

export function buildContentVersion(agg: ContentVersionAggregate): string {
  const ts = (value: string | null) => value ?? "none";
  return [
    `p${agg.posts.count}|${ts(agg.posts.newestCreatedAt)}|${agg.posts.open}/${agg.posts.monitoring}/${agg.posts.resolved}|rev${agg.posts.reviewed}`,
    `r${agg.replies.count}|${ts(agg.replies.newestCreatedAt)}`,
    `d${agg.docs.count}|${ts(agg.docs.newestUpdatedAt)}|${ts(agg.docs.newestRevisedAt)}|${agg.docs.approved}/${agg.docs.needsReview}/${agg.docs.needsAttention}/${agg.docs.reviewing}|${ts(agg.docs.newestApprovedAt)}|${ts(agg.docs.newestRejectedAt)}|${ts(agg.docs.newestReviewTransferredAt)}`,
    `c${agg.comments.count}|${ts(agg.comments.newestCreatedAt)}`,
    `b${agg.bots.count}`,
    `dl${agg.downloads.total}`,
  ].join("~");
}

function newestTimestamp(values: string[]): string | null {
  return values.reduce<string | null>((latest, value) => (!latest || value > latest ? value : latest), null);
}

// 无数据库（本地 JSON 回退）时的降级派生：从读取层算聚合。
// 评论 / 下载粒度忽略（回退模式无此数据，恒为零值）。
export function deriveContentAggregate(posts: EnrichedPost[], docs: MarkdownDoc[], bots: Bot[]): ContentVersionAggregate {
  const replies = posts.flatMap((post) => post.replies);
  return {
    posts: {
      count: posts.length,
      newestCreatedAt: newestTimestamp(posts.map((post) => post.createdAt)),
      open: posts.filter((post) => post.status === "open").length,
      monitoring: posts.filter((post) => post.status === "monitoring").length,
      resolved: posts.filter((post) => post.status === "resolved").length,
      reviewed: posts.filter((post) => post.reviewedAt !== null).length,
    },
    replies: {
      count: replies.length,
      newestCreatedAt: newestTimestamp(replies.map((reply) => reply.createdAt)),
    },
    docs: {
      count: docs.length,
      newestUpdatedAt: newestTimestamp(docs.map((doc) => doc.updatedAt)),
      newestRevisedAt: newestTimestamp(docs.filter((doc) => doc.revisedAt).map((doc) => doc.revisedAt as string)),
      approved: docs.filter((doc) => doc.contentState === "Approved").length,
      needsReview: docs.filter((doc) => doc.contentState === "Needs Review").length,
      needsAttention: docs.filter((doc) => doc.contentState === "Needs Attention").length,
      reviewing: docs.filter((doc) => doc.contentState === "Reviewing").length,
      newestApprovedAt: newestTimestamp(docs.filter((doc) => doc.approvedAt).map((doc) => doc.approvedAt as string)),
      newestRejectedAt: newestTimestamp(docs.filter((doc) => doc.rejectedAt).map((doc) => doc.rejectedAt as string)),
      newestReviewTransferredAt: newestTimestamp(docs.filter((doc) => doc.reviewTransferredAt).map((doc) => doc.reviewTransferredAt as string)),
    },
    comments: { count: 0, newestCreatedAt: null },
    bots: { count: bots.length },
    downloads: { total: 0 },
  };
}

// pg 对 count(*)/sum(...) 返回字符串（bigint），对 timestamptz 返回 Date——
// 统一归一化后再进签名，避免类型漂移。
type ContentVersionRow = Record<string, string | number | Date | null>;

function normalizeTs(value: string | number | Date | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function normalizeNum(value: string | number | Date | null): number {
  if (typeof value === "number") return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

// 全站内容版本：有数据库时一条聚合 SQL；无数据库（本地 JSON 回退）时从读取层派生。
export async function getContentVersion(): Promise<string> {
  const sql = getOptionalSql();
  if (sql) {
    const rows = (await sql`
      select
        (select count(*) from posts) as post_count,
        (select max(created_at) from posts) as post_newest,
        (select count(*) from posts where status = 'open') as post_open,
        (select count(*) from posts where status = 'monitoring') as post_monitoring,
        (select count(*) from posts where status = 'resolved') as post_resolved,
        (select count(*) from posts where reviewed_at is not null) as post_reviewed,
        (select count(*) from post_replies) as reply_count,
        (select max(created_at) from post_replies) as reply_newest,
        (select count(*) from docs) as doc_count,
        (select max(updated_at) from docs) as doc_newest_updated,
        (select max(revised_at) from docs) as doc_newest_revised,
        (select count(*) from docs where content_state = 'Approved') as doc_approved,
        (select count(*) from docs where content_state = 'Needs Review') as doc_needs_review,
        (select count(*) from docs where content_state = 'Needs Attention') as doc_needs_attention,
        (select count(*) from docs where content_state = 'Reviewing') as doc_reviewing,
        (select max(approved_at) from docs) as doc_newest_approved,
        (select max(rejected_at) from docs) as doc_newest_rejected,
        (select max(review_transferred_at) from docs) as doc_newest_review_transferred,
        (select count(*) from doc_comments) as comment_count,
        (select max(created_at) from doc_comments) as comment_newest,
        (select count(*) from bots) as bot_count,
        (select coalesce(sum(count), 0) from doc_download_counts) as download_total
    `) as ContentVersionRow[];
    const row = rows[0] ?? {};
    return buildContentVersion({
      posts: {
        count: normalizeNum(row.post_count),
        newestCreatedAt: normalizeTs(row.post_newest),
        open: normalizeNum(row.post_open),
        monitoring: normalizeNum(row.post_monitoring),
        resolved: normalizeNum(row.post_resolved),
        reviewed: normalizeNum(row.post_reviewed),
      },
      replies: {
        count: normalizeNum(row.reply_count),
        newestCreatedAt: normalizeTs(row.reply_newest),
      },
      docs: {
        count: normalizeNum(row.doc_count),
        newestUpdatedAt: normalizeTs(row.doc_newest_updated),
        newestRevisedAt: normalizeTs(row.doc_newest_revised),
        approved: normalizeNum(row.doc_approved),
        needsReview: normalizeNum(row.doc_needs_review),
        needsAttention: normalizeNum(row.doc_needs_attention),
        reviewing: normalizeNum(row.doc_reviewing),
        newestApprovedAt: normalizeTs(row.doc_newest_approved),
        newestRejectedAt: normalizeTs(row.doc_newest_rejected),
        newestReviewTransferredAt: normalizeTs(row.doc_newest_review_transferred),
      },
      comments: {
        count: normalizeNum(row.comment_count),
        newestCreatedAt: normalizeTs(row.comment_newest),
      },
      bots: { count: normalizeNum(row.bot_count) },
      downloads: { total: normalizeNum(row.download_total) },
    });
  }

  const [posts, docs, bots] = await Promise.all([getEnrichedPosts(), getDocs(), getBots()]);
  return buildContentVersion(deriveContentAggregate(posts, docs, bots));
}
