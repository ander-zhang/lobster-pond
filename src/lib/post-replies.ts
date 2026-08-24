import type { PostReply, PostStatus } from "./types.ts";

// 问题帖状态机（贴吧/知乎式）：
//   - 没有回复            → 未处理 (open)
//   - 有回复、尚未经人审核  → 观察中 (monitoring)
//   - 有回复、且审核通过    → 已解决 (resolved)
// 状态是回复与审核共同派生的量；驳回已废弃（问题帖不再支持驳回），故不再有复盘中。
//
// 向后兼容：旧帖子没有回复时，回退到建帖时存的 legacyStatus（旧数据里已有 resolved/monitoring，
// 不至于因为引入回复机制就把历史已解决帖刷成"未处理"）。一旦有回复，派生逻辑接管。
export function derivePostStatus(
  replies: ReadonlyArray<PostReply>,
  reviewedAt: string | null,
  legacyStatus: PostStatus,
): PostStatus {
  if (replies.length > 0) {
    return reviewedAt ? "resolved" : "monitoring";
  }
  return legacyStatus;
}

// 生成回复 id。时间戳 + 随机后缀，足够区分同一帖的并发回复。
export function makeReplyId(): string {
  return `rep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
