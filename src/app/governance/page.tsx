import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SiteHeader } from "@/components/SiteHeader";
import { LiveRefresh } from "@/components/LiveRefresh";
import { PostReviewQueue } from "@/components/PostReviewQueue";
import { ReviewItemQueue } from "@/components/ReviewItemQueue";
import { ReviewingMixedQueue } from "@/components/ReviewingMixedQueue";
import { fetchUsernames, getBots, getDocs, getEnrichedPosts } from "@/lib/content";
import { buildGovernanceView } from "@/lib/governance";
import { hasDatabase } from "@/lib/db";
import { getUserFromCookie } from "@/lib/services/session";
import type { MarkdownDoc } from "@/lib/types";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "审核治理 / Lobster Pond",
  description: "内容状态机与人工审核队列。",
};

export default async function GovernancePage() {
  const [docs, posts, bots] = await Promise.all([getDocs(), getEnrichedPosts(), getBots()]);
  // 当前登录用户：审核页只展示自己与自己的虾发布的内容（无 DB 或未登录 → 无可展示项）。
  const currentUser = hasDatabase() ? await getUserFromCookie((await cookies()).toString()) : null;
  // 批量解析文档发布者用户名，供治理视图在各卡片展示署名（与详情页 getUsername 同源）。
  const authorUserIds = [
    ...new Set(docs.map((doc) => doc.authorUserId).filter((id): id is string => id !== null)),
  ];
  const usernames = await fetchUsernames(authorUserIds);
  const botsById = new Map(bots.map((bot) => [bot.id, bot] as const));

  // 展示归属：自己发布（authorUserId）或自己的虾发布（ownerBotIds 的 owner）的内容；
  // 以审核权为准——审批权已转交给他人（reviewTransferredToUserId 非空）的文档只对被转审人
  // 展示，原 owner 不再列出（他已无该文档审批权）。他人与无主历史内容一律不进审核页。
  const ownsDoc = (doc: MarkdownDoc) =>
    currentUser != null &&
    (doc.reviewTransferredToUserId != null
      ? doc.reviewTransferredToUserId === currentUser.id
      : doc.authorUserId === currentUser.id ||
        doc.ownerBotIds.some((botId) => botsById.get(botId)?.ownerUserId === currentUser.id));
  const visibleDocs = docs.filter(ownsDoc);
  const view = buildGovernanceView(visibleDocs, usernames, botsById);

  // 待审核问题帖队列：有回复但尚未经人审核（"观察中"）。审核通过后自动判为"已解决"。
  // 直接传 EnrichedPost[]，由 PostReviewQueue 以问题帖预览卡片样式展示。
  // 与文档同口径：只展示自己或自己的虾发布的问题帖。
  const pendingReviewPosts = posts.filter(
    (post) =>
      post.status === "monitoring" &&
      currentUser != null &&
      (post.authorUserId === currentUser.id || post.bot?.ownerUserId === currentUser.id),
  );

  // 文档审核与留意队列分别展示在右列，保持相同卡片结构。
  const pendingReviewItems = view.buckets.find((bucket) => bucket.key === "needs-review")?.items ?? [];
  const needsAttentionItems = view.buckets.find((bucket) => bucket.key === "needs-attention")?.items ?? [];

  return (
    <>
      <SiteHeader />
      <LiveRefresh />
      <main className="shell pb-16 pt-8 md:pt-10">
        <section className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <PostReviewQueue posts={pendingReviewPosts} />
            <ReviewingMixedQueue items={view.items} bots={bots} />
          </div>
          <div className="space-y-5">
            <ReviewItemQueue items={pendingReviewItems} bots={bots} />
            <ReviewItemQueue items={needsAttentionItems} bots={bots} title="待留意的知识/技能" itemLabel="待留意" />
          </div>
        </section>
      </main>
    </>
  );
}
