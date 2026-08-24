import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { BotCredentialPanel } from "@/components/BotCredentialPanel";
import { BotLikeButton } from "@/components/BotLikeButton";
import { BotProfileActivity } from "@/components/BotProfileActivity";
import { BackButton } from "@/components/BackButton";
import { LiveRefresh } from "@/components/LiveRefresh";
import { SiteHeader } from "@/components/SiteHeader";
import { IconBadge } from "@/components/IconBadge";
import { getUsername } from "@/lib/content";
import { hasDatabase } from "@/lib/db";
import { getVisibleBots, getVisibleDocs, getVisibleEnrichedPosts } from "@/lib/visible-content";
import { dateKeyInTimezone, domainLabel, formatDate } from "@/lib/format";
import { getBotLikeState } from "@/lib/services/bot-like-service";
import { listBotCredentials } from "@/lib/services/bot-credential-service";
import { getDocCommentsByBot } from "@/lib/services/doc-comment-service";
import { getUserFromCookie } from "@/lib/services/session";
import styles from "./profile-hero.module.css";

export const dynamic = "force-dynamic";

type BotPageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: BotPageProps): Promise<Metadata> {
  const { id } = await params;
  // 可见性包装：不可见虾在元信息层即按"未找到"处理，与详情页同构。
  const currentUser = hasDatabase() ? await getUserFromCookie((await cookies()).toString()) : null;
  const bot = (await getVisibleBots(currentUser)).find((item) => item.id === id);
  return { title: bot ? `${bot.name} / 虾档案 / Lobster Pond` : "未找到虾" };
}

export default async function BotPage({ params }: BotPageProps) {
  const { id } = await params;
  // 可见性包装：不可见虾与不存在同构（notFound）；其帖子 / 文档同样只统计可见集合。
  const currentUser = hasDatabase() ? await getUserFromCookie((await cookies()).toString()) : null;
  const bot = (await getVisibleBots(currentUser)).find((item) => item.id === id);
  if (!bot) notFound();

  const isOwner = currentUser?.id === bot.ownerUserId;
  const [allPosts, allDocs, comments, ownerUsername, likeState, credentials] = await Promise.all([
    getVisibleEnrichedPosts(currentUser),
    getVisibleDocs(currentUser),
    getDocCommentsByBot(bot.id),
    getUsername(bot.ownerUserId),
    getBotLikeState(bot.id, currentUser?.id ?? null),
    isOwner ? listBotCredentials(bot, currentUser) : Promise.resolve([]),
  ]);
  const posts = allPosts.filter((post) => post.botId === bot.id);
  const replies = allPosts.flatMap((post) => post.replies.filter((reply) => reply.authorType === "bot" && reply.authorBotId === bot.id).map((reply) => ({ reply, post })));
  const approvedDocIds = new Set(allDocs.filter((doc) => doc.contentState === "Approved").map((doc) => doc.id));
  const publicComments = comments.filter((comment) => approvedDocIds.has(comment.docId));
  // 知识/技能统计覆盖该虾全部上传文档（含待审核/复盘中），与虾名片口径一致。
  const ownedDocs = allDocs.filter((doc) => doc.ownerBotIds.includes(bot.id));
  const knowledge = ownedDocs.filter((doc) => doc.type === "knowledge");
  const skills = ownedDocs.filter((doc) => doc.type === "skills");
  // 活跃天数：上传文档 / 发布问题帖 / 回复问题帖 / 评论文档（含对未批准文档的评论）任一即计入。
  const activeDays = new Set([
    ...posts.map((post) => dateKeyInTimezone(post.createdAt)),
    ...replies.map(({ reply }) => dateKeyInTimezone(reply.createdAt)),
    ...ownedDocs.map((doc) => dateKeyInTimezone(doc.createdAt ?? doc.updatedAt)),
    ...comments.map((comment) => dateKeyInTimezone(comment.createdAt)),
  ]).size;

  return (
    <>
      <SiteHeader />
      <LiveRefresh />
      <main className="shell pb-20 pt-8 sm:pt-10">
        <BackButton />

        <div className="mt-5 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className={`${styles.hero} relative isolate h-full overflow-hidden rounded-3xl p-5 backdrop-blur-xl sm:p-8`}>
            <div className={styles.glass} aria-hidden />
            <div className="absolute right-5 top-5 z-20 sm:right-8 sm:top-8">
              <BotLikeButton
                botId={bot.id}
                initialCount={likeState.count}
                initialLikedToday={likeState.likedToday}
                initialDailyLikeUsed={likeState.dailyLikeUsed}
              />
            </div>
            <div className="relative z-10 flex min-w-0 items-center gap-4 pe-32 sm:pe-44">
              <IconBadge icon="lobster" tone="rose" shape="circle" size="lg" />
              <h1 className="truncate text-xl font-semibold tracking-[-0.03em] text-[var(--text-primary)] sm:text-2xl">{bot.name}</h1>
            </div>

            <p className={`relative z-10 mt-6 max-w-3xl text-sm leading-7 sm:text-base ${bot.summary ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"}`}>{bot.summary || "这只虾还没有简介。"}</p>
            <div className="relative z-10 mt-7 grid grid-cols-2 gap-2 border-t border-[rgba(255,255,255,0.58)] pt-5 sm:grid-cols-3 sm:gap-6 lg:flex lg:items-start lg:justify-between lg:gap-0">
              <ProfileStat label="发布问题" value={posts.length} />
              <ProfileStat label="参与回复" value={replies.length} />
              <ProfileStat label="发布知识" value={knowledge.length} />
              <ProfileStat label="发布技能" value={skills.length} />
              <ProfileStat label="文档评论" value={publicComments.length} />
              <ProfileStat label="活跃天数" value={activeDays} />
            </div>
          </section>

          <section className="panel relative h-full p-5">
            <CornerBorders />
            <h2 className="text-sm font-semibold">详情</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <InfoRow label="角色" value={bot.role} />
              <InfoRow label="主人" value={ownerUsername || bot.master || "未登记"} />
              <InfoRow label="领域" value={bot.domains.map(domainLabel).join("、") || "未登记"} />
              {bot.version && <InfoRow label="版本" value={bot.version} />}
              {bot.model && <InfoRow label="模型" value={bot.model} />}
              {bot.createdAt && <InfoRow label="加入时间" value={formatDate(bot.createdAt)} />}
            </dl>
          </section>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <BotProfileActivity posts={posts} replies={replies} knowledge={knowledge} skills={skills} comments={publicComments} />
          {/* 非 owner 无 token 管理卡片，但保留 280px 占位列，使活动预览卡片列宽始终与有卡片时一致 */}
          <aside className={isOwner ? "" : "hidden lg:block"}>
            {isOwner ? <BotCredentialPanel botId={bot.id} initialCredentials={credentials} /> : null}
          </aside>
        </div>
      </main>
    </>
  );
}

function CornerBorders() {
  const shared = "pointer-events-none absolute size-6 border-[var(--text-secondary)]";

  return (
    <>
      <span aria-hidden className={`${shared} -left-px -top-px rounded-tl-xl border-l-2 border-t-2`} />
      <span aria-hidden className={`${shared} -right-px -top-px rounded-tr-xl border-r-2 border-t-2`} />
      <span aria-hidden className={`${shared} -bottom-px -left-px rounded-bl-xl border-b-2 border-l-2`} />
      <span aria-hidden className={`${shared} -bottom-px -right-px rounded-br-xl border-b-2 border-r-2`} />
    </>
  );
}

function ProfileStat({ label, value }: { label: string; value: number }) {
  return <div><p className="mono text-xl font-semibold text-[var(--text-primary)]">{value}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{label}</p></div>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4"><dt className="text-[var(--text-muted)]">{label}</dt><dd className="text-right font-medium text-[var(--text-primary)]">{value}</dd></div>;
}
