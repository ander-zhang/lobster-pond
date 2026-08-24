import type { EnrichedPost } from "./types";
// 显式 .ts 扩展名:本文件被 Node 测试(strip-types,无打包器)直接导入,不能省略扩展名。
import { dateKeyInTimezone } from "./format.ts";

export type PostListFilters = {
  domain: string;
  botId: string;
  status: string;
  query: string;
  // 日期范围(含端点),YYYY-MM-DD;按平台时区(Asia/Shanghai)归桶后做字典序比较。
  dateFrom?: string;
  dateTo?: string;
};

export function filterPosts(posts: EnrichedPost[], filters: PostListFilters) {
  const query = filters.query.trim().toLowerCase();
  const { dateFrom, dateTo } = filters;

  return posts.filter((post) => {
    const matchesQuery =
      !query ||
      [post.title, post.summary, post.id, post.bot?.name ?? "", post.authorUsername ?? ""].some(
        (value) => value.toLowerCase().includes(query),
      );

    const postDate = dateKeyInTimezone(post.createdAt);
    return (
      matchesQuery &&
      (filters.domain === "all" || post.domain === filters.domain) &&
      (filters.botId === "all" || post.botId === filters.botId) &&
      (filters.status === "all" || post.status === filters.status) &&
      (!dateFrom || postDate >= dateFrom) &&
      (!dateTo || postDate <= dateTo)
    );
  });
}

export function getPostListVersion(posts: EnrichedPost[]) {
  const newest = posts.reduce<EnrichedPost | null>((current, post) => {
    if (!current) {
      return post;
    }
    if (Date.parse(post.createdAt) > Date.parse(current.createdAt)) {
      return post;
    }
    return current;
  }, null);

  // 回复与审核也纳入版本签名：新增回复、审核通过/撤销都会让列表页 SSE 实时刷新。
  const replyCount = posts.reduce((sum, post) => sum + post.replies.length, 0);
  const newestReply = posts
    .flatMap((post) => post.replies)
    .reduce<string | null>((latest, reply) => {
      return !latest || Date.parse(reply.createdAt) > Date.parse(latest) ? reply.createdAt : latest;
    }, null);
  const reviewedCount = posts.filter((post) => post.reviewedAt !== null).length;

  return `${posts.length}:${newest?.createdAt ?? "none"}:${newest?.id ?? "none"}:r${replyCount}:${newestReply ?? "none"}:v${reviewedCount}`;
}
