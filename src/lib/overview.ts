import { dateKeyInTimezone } from "./format.ts";
import type { ContentState, DocType, MarkdownDoc, Post, PostStatus } from "./types.ts";

// 总览页"本周待复审"卡片的数据装配（纯函数，避开 DB / JSX，便于单测）。
// 语义：展示本周（周一至周日，平台时区）进入待复审状态的内容——
//   - 问题帖：本周进入【观察中】（monitoring）的帖子。
//   - 文档：本周进入【待审核】（Needs Review）的知识 / 技能。
// 关键：筛选不按发布 / 更新时间，而按"进入待复审状态"的日期过滤——
// 即使帖子 / 文档发布很早，只要这一周它进入了观察中 / 待审核，也要出现在本周卡片。
// 卡片上展示的时间是【发布时间】（问题帖 createdAt / 文档 createdAt ?? updatedAt），
// 与筛选依据（进入待复审的时刻）解耦：发布日期 + 本周进入，两者独立判定。

export type PendingReviewItem = {
  key: string;
  href: string;
  title: string;
  // 卡片上展示的日期键（发布时间，YYYY-MM-DD，平台时区）；与筛选 / 排序依据不同源。
  dateKey: string;
  // 排序依据（进入待复审的时刻）；仅用于排序，不出现在卡片上。
  sortKey: string;
  kind: "post" | "doc";
  postStatus?: PostStatus;
  docState?: ContentState;
  docType?: DocType;
};

// 问题帖进入【观察中】的时刻（ISO）。优先取持久化的 monitoring_entered_at——
// 迁移 040 起在每次进入时精确记录，含已解决帖被新回复 / 撤销审批重开；
// 历史 / 种子帖（JSON 回退、迁移前数据）无该字段，回退到最早回复时间
//（首条回复就是 open → monitoring 的转移点，覆盖"发布后首次被回复"的主流场景）。
export function monitoringEnteredAt(post: Post): string | null {
  if (post.monitoringEnteredAt) {
    return post.monitoringEnteredAt;
  }
  let earliest: string | null = null;
  for (const reply of post.replies) {
    if (reply.createdAt && (earliest === null || reply.createdAt < earliest)) {
      earliest = reply.createdAt;
    }
  }
  return earliest;
}

// 问题帖进入【观察中】的日期键（YYYY-MM-DD，平台时区）。无进入时刻返回空串。
export function monitoringEnteredDateKey(post: Post): string {
  const at = monitoringEnteredAt(post);
  return at ? dateKeyInTimezone(at) : "";
}

// 组装本周待复审卡片条目：观察中且本周进入的帖子 + 待审核且本周进入的文档，
// 合并后按进入时间正序（自上至下，由早到晚）排列。
export function buildPendingReviewItems(
  posts: Post[],
  docs: MarkdownDoc[],
  reviewWindow: Set<string>,
): PendingReviewItem[] {
  const items: PendingReviewItem[] = [];

  for (const post of posts) {
    if (post.status !== "monitoring") continue;
    // 筛选按进入观察中的时刻（本周）；卡片展示发布时间（createdAt）。
    const enteredKey = monitoringEnteredDateKey(post);
    if (!reviewWindow.has(enteredKey)) continue;
    items.push({
      key: `post-${post.id}`,
      href: `/posts/${post.id}`,
      title: post.title,
      dateKey: dateKeyInTimezone(post.createdAt),
      sortKey: monitoringEnteredAt(post) ?? post.createdAt,
      kind: "post",
      postStatus: post.status,
    });
  }

  for (const doc of docs) {
    if (doc.contentState !== "Needs Review") continue;
    // 文档进入待审核的时刻 = updatedAt：机器接口发布与修订后落入 Needs Review 的路径
    // 都会把 updated_at 写成当天（createDoc / updateDocFromUpload），故筛选按 updatedAt 判定。
    const enteredKey = dateKeyInTimezone(doc.updatedAt);
    if (!reviewWindow.has(enteredKey)) continue;
    items.push({
      key: `doc-${doc.type}-${doc.id}`,
      href: `/library/${doc.type}/${doc.id}`,
      title: doc.title,
      // 卡片展示发布时间（createdAt；历史 / 本地回退无 createdAt 时退回 updatedAt）。
      dateKey: dateKeyInTimezone(doc.createdAt ?? doc.updatedAt),
      sortKey: doc.updatedAt,
      kind: "doc",
      docState: doc.contentState,
      docType: doc.type,
    });
  }

  return items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}
