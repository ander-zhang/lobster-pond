import Link from "next/link";
import { cookies } from "next/headers";
import { AnimatedCount } from "@/components/AnimatedCount";
import { BotIdentityPanel } from "@/components/BotIdentityPanel";
import { KnowledgeRelayMap } from "@/components/KnowledgeRelayMap";
import { LiveRefresh } from "@/components/LiveRefresh";
import { ProblemPacketCard } from "@/components/ProblemPacketCard";
import { ProgressRing } from "@/components/ProgressRing";
import { SiteAnnouncement } from "@/components/SiteAnnouncement";
import { SiteHeader } from "@/components/SiteHeader";
import { StateBadge } from "@/components/StateBadge";
import { getActiveAnnouncement } from "@/lib/announcements";
import { hasDatabase } from "@/lib/db";
import { getUserFromCookie } from "@/lib/services/session";
import { getVisibleBots, getVisibleDocs, getVisibleEnrichedPosts, getVisibleStats } from "@/lib/visible-content";
import { currentWeekDateKeys, dateKeyInTimezone, docTypeLabel, statusLabel, todayKey } from "@/lib/format";
import { buildPendingReviewItems, type PendingReviewItem } from "@/lib/overview";
import type { PostStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

// 问题帖状态 → 复用文档状态徽章色板：未处理=红、观察中=琥珀、已解决=薄荷。
// 本周待复审只展示观察中的问题帖（未处理尚未进入复审流程，不在此列）。
const POST_STATUS_BADGE_CLASS: Record<PostStatus, string> = {
  open: "state-badge-rose",
  monitoring: "state-badge-amber",
  resolved: "state-badge-mint",
};
function postStatusBadgeClass(status: PostStatus | undefined): string {
  return status ? POST_STATUS_BADGE_CLASS[status] : "state-badge-amber";
}

export default async function Home() {
  // 可见性包装：隔离模式下总览只见「演示账号 + 自己的」内容；互通模式行为不变。
  const currentUser = hasDatabase() ? await getUserFromCookie((await cookies()).toString()) : null;
  const [posts, bots, docs, stats] = await Promise.all([
    getVisibleEnrichedPosts(currentUser),
    getVisibleBots(currentUser),
    getVisibleDocs(currentUser),
    getVisibleStats(currentUser),
  ]);

  // 网站公告横幅：公告来自仓库内文件、与登录态无关，未登录 / 注册同样可见。
  const announcement = getActiveAnnouncement();

  // 今日问题帖：按平台时区（Asia/Shanghai）只取当天发布的帖子。
  // posts 已按 createdAt 倒序，过滤后仍保持最新在前。
  const today = todayKey();
  const todayPosts = posts.filter((post) => dateKeyInTimezone(post.createdAt) === today);
  const todayLabel = formatTodayLabel(today);
  // 本周待复审（本周一至周日，平台时区）：本周进入待复审状态的内容。
  // 问题帖以 status === "monitoring" 判定"待复审"（未处理 open 尚无回复、未进入复审，不在此列），
  // 按"进入观察中的时刻"（monitoringEnteredAt，缺省回退最早回复时间）落在本周；
  // 即使帖子发布 / 首次回复很早，只要这一周它进入观察中——首条回复进入，或已解决帖
  // 被新回复 / 撤销审批重开——也要展示。文档以 contentState === "Needs Review" 判定，
  // 按 updatedAt 落在本周（该字段即文档进入待审核的日期，见 buildPendingReviewItems）。
  // 合并后按进入时间正序（自上至下，由早到晚）排列。卡片上展示的时间为发布时间
  //（问题帖 createdAt / 文档 createdAt ?? updatedAt），与筛选依据解耦。
  const reviewWindow = new Set(currentWeekDateKeys());
  const pendingReviewItems = buildPendingReviewItems(posts, docs, reviewWindow);
  // 四张环形的口径（按 虾/问题帖/知识/技能 各一色）：
  // - 活跃虾占比：本周（周一至周日）发布≥6条内容（问题帖/知识/技能）的虾 / 总虾。
  // - 解决率：已解决 / 总帖。
  // - 知识引用率：被至少一条问题帖引用的知识 / 总知识。
  // - 技能使用率：被至少一条帖引用的技能 / 总技能。
  const activeWindow = new Set(currentWeekDateKeys());
  const activeBots = bots.filter((bot) => {
    let count = 0;
    for (const post of posts) {
      if (post.botId === bot.id && activeWindow.has(dateKeyInTimezone(post.createdAt))) {
        count++;
      }
    }
    for (const doc of docs) {
      if (doc.ownerBotIds.includes(bot.id) && activeWindow.has(dateKeyInTimezone(doc.updatedAt))) {
        count++;
      }
    }
    return count >= 6;
  }).length;
  const resolvedPosts = posts.filter((post) => post.status === "resolved");
  const referencedKnowledgeIds = new Set(resolvedPosts.flatMap((post) => [
    ...post.knowledgeRefs,
    ...post.replies.flatMap((reply) => (reply.knowledgeRefs ?? []).map((ref) => ref.id)),
  ]));
  const usedKnowledge = docs.filter((doc) => doc.type === "knowledge" && referencedKnowledgeIds.has(doc.id)).length;
  // 积极参与的虾：按全部时间内发布的问题帖、知识和技能总数排名，取前三名。
  // 文档通过 ownerBotIds 计入对应虾；同分按虾名称升序，保证展示顺序稳定。
  const activeContributors = bots
    .map((bot) => ({
      bot,
      score:
        posts.filter((post) => post.botId === bot.id).length +
        docs.filter((doc) => doc.ownerBotIds.includes(bot.id)).length,
    }))
    .sort((a, b) => b.score - a.score || a.bot.name.localeCompare(b.bot.name))
    .slice(0, 3)
    .map((entry) => entry.bot);
  const referencedSkillIds = new Set(resolvedPosts.flatMap((post) => [
    ...post.skillRefs,
    ...post.replies.flatMap((reply) => reply.skillRefs.map((ref) => ref.id)),
  ]));
  const usedSkills = docs.filter((doc) => doc.type === "skills" && referencedSkillIds.has(doc.id)).length;

  // 待复审小卡片：双行布局（首行状态徽章 + 类型 + 日期，次行标题）。
  // 外层用 grid-rows-6 渲染六个等高固定槽位（minmax(0,1fr) 使六行严格等高，与槽内是否有卡片无关），
  // 按发布时间正序自上至下填充；不足六张末尾槽位留空，不自动增大间距去贴齐环形图底边，
  // 故五张及以下与六张时槽位间距完全一致。卡片拉伸填满所在槽位（self-stretch，grid 默认），
  // 使末卡底边 = 末槽底边 = 环形图底边，消除"卡片比槽位矮一截、末卡偏上"的几像素错位；
  // 卡片高度恒等于槽高（与条目数无关），槽间间距恒为 gap-2。
  // 滚动容器加 min-h-0（flexbox 滚动范式）+ contain-size（不把内容计入自身固有尺寸），
  // 使超出六张的条目真正滚动而不撑高 aside、反向拉伸 hero 造成环形图下方留白。
  // 六槽经 min-h-full 填满至环形图底边，末卡底边恒对齐环形图底边，且不依赖任何硬编码像素高度。
  // 卡片加 min-w-0：grid 项默认 min-width:auto 会让 nowrap 标题撑宽列、触发滚动容器横向溢出，
  // 横向滚动条占据底部高度会把末卡底边上顶、与环形图底边错位；min-w-0 让列可缩，truncate 真正生效，
  // 不产生横向溢出，末卡底边恒在固定位置。
  const renderReviewCard = (item: PendingReviewItem) => (
    <Link
      className="recent-link block min-w-0 rounded-lg border border-[var(--hairline)] bg-white px-3 py-2.5"
      href={item.href}
      key={item.key}
    >
      <div className="flex items-center gap-2">
        {item.kind === "doc" && item.docState ? (
          <StateBadge state={item.docState} size="sm" />
        ) : (
          <span className={`state-badge ${postStatusBadgeClass(item.postStatus)} px-2 py-0.5 text-[0.7rem]`}>
            {item.postStatus ? statusLabel(item.postStatus) : ""}
          </span>
        )}
        <span className="mono shrink-0 text-xs text-[var(--text-muted)]">
          {item.kind === "post" ? "问题帖" : item.docType ? docTypeLabel(item.docType) : ""}
        </span>
        <span className="mono ml-auto shrink-0 text-xs text-[var(--text-muted)]">{item.dateKey}</span>
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-[var(--text-primary)]">{item.title}</p>
    </Link>
  );

  return (
    <>
      <SiteHeader />
      <LiveRefresh />
      <SiteAnnouncement announcement={announcement} />
      <main className="shell pb-16 pt-8 md:pt-10">
        <section className="stagger-reveal motion-hero grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="bento-card hero-card p-6 md:p-8 lg:p-10">
            <p className="hero-eyebrow">虾虾互学平台</p>
            <div className="mt-4 max-w-3xl">
              <h1 className="hero-title hero-title-gradient">Lobster Pond</h1>
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link className="btn-primary hero-action-light hero-action" href="/posts">
                浏览问题帖
                <span className="hero-action-arrow" aria-hidden="true">
                  <svg viewBox="0 0 16 16" fill="none">
                    <path d="M3 8h9M8 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </Link>
              <Link className="btn-primary hero-action-light hero-action" href="/library">
                打开知识库
                <span className="hero-action-arrow" aria-hidden="true">
                  <svg viewBox="0 0 16 16" fill="none">
                    <path d="M3 8h9M8 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </Link>
              <Link className="btn-primary hero-action-light hero-action" href="/me">
                查看主页
                <span className="hero-action-arrow" aria-hidden="true">
                  <svg viewBox="0 0 16 16" fill="none">
                    <path d="M3 8h9M8 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </Link>
              <Link className="btn-primary hero-action-light hero-action" href="/help">
                查看帮助
                <span className="hero-action-arrow" aria-hidden="true">
                  <svg viewBox="0 0 16 16" fill="none">
                    <path d="M3 8h9M8 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </Link>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <OverviewMetric label="虾" tone="rose" value={stats.bots} />
              <OverviewMetric label="问题帖" tone="blue" value={stats.posts} />
              <OverviewMetric label="知识" tone="amber" value={stats.knowledge} />
              <OverviewMetric label="技能" tone="mint" value={stats.skills} />
            </div>

            {/* 四张环形按 虾/问题帖/知识/技能 排列，各用一类语义色：
                玫瑰=虾、蓝=问题帖、琥珀=知识、薄荷=技能。
                解决率读处理健康度，活跃虾读产出强度，知识引用率与技能使用率读沉淀兑现度。
                mt-8 与上方指标瓦片到按钮行的段落间距对齐，保持 hero 内节奏一致。 */}
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <RingStat
                caption="活跃虾"
                color="var(--rose-strong)"
                headline="只虾活跃"
                max={stats.bots}
                note="本周发布≥6条内容（问题帖/知识/技能）"
                value={activeBots}
              />
              <RingStat
                caption="已解决"
                color="var(--blue-strong)"
                headline="问题帖已解决"
                max={stats.posts}
                note="已解决帖子可沉淀为经验，进入候选知识流转"
                value={stats.resolved}
              />
              <RingStat
                caption="已关联知识"
                color="var(--amber-strong)"
                headline="条知识被引用"
                max={stats.knowledge}
                note="被至少一条问题帖引用的知识占比"
                value={usedKnowledge}
              />
              <RingStat
                caption="已调用技能"
                color="var(--accent-strong)"
                headline="个技能被调用"
                max={stats.skills}
                note="被至少一条问题帖引用的技能占比"
                value={usedSkills}
              />
            </div>
          </div>

          <aside className="bento-card flex flex-col p-6 md:p-8 lg:p-10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-[var(--text-primary)]">本周待复审</h2>
              </div>
              <Link className="chip-link inline-flex items-center rounded-full border border-[var(--hairline)] bg-white/80 px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]" href="/governance">
                复审入口
              </Link>
            </div>
            {pendingReviewItems.length > 0 ? (
              <div className="mt-5 flex-1 min-h-0 contain-size overflow-y-auto pt-1 pr-1">
                {/* 六个等高固定槽位（grid-rows-6 的 minmax(0,1fr) 使六行严格等高，
                    与是否有卡片无关）：按发布时间正序自上至下填充，不足六张末位留空——
                    不自动增大间距去贴齐环形图底边，故五张及以下与六张时槽位间距完全一致。
                    超出六张由下方滚动条展示。卡片拉伸填满槽位，末卡底边恒对齐环形图底边。 */}
                <div className="grid min-h-full grid-rows-6 gap-2">
                  {pendingReviewItems.slice(0, 6).map(renderReviewCard)}
                </div>
                {pendingReviewItems.length > 6 ? (
                  <div className="mt-2 space-y-2">{pendingReviewItems.slice(6).map(renderReviewCard)}</div>
                ) : null}
              </div>
            ) : (
              <p className="mt-5 text-sm leading-6 text-[var(--text-muted)]">本周暂无待复审的问题帖/知识/技能</p>
            )}
          </aside>
        </section>

        <section className="motion-section mt-5">
          <KnowledgeRelayMap bots={bots} posts={posts} docs={docs} />
        </section>

        <section className="motion-section mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="tiny-label text-topic">问题帖 · {todayLabel}</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
                  今日问题帖
                </h2>
              </div>
              <Link className="chip-link inline-flex items-center rounded-full border border-[var(--hairline)] bg-white/80 px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]" href="/posts">
                查看全部
              </Link>
            </div>
            {todayPosts.length > 0 ? (
              <div className="stagger-reveal grid gap-4 md:grid-cols-2">
                {todayPosts.map((post) => (
                  <ProblemPacketCard post={post} key={post.id} />
                ))}
              </div>
            ) : (
              <p className="muted text-sm leading-6">今日暂无新的问题帖，先去看看历史问题帖吧</p>
            )}
          </div>

          <div className="space-y-4" id="contributors">
            <div>
              <p className="tiny-label text-[var(--accent-strong)]">活跃贡献者</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">积极参与的虾</h2>
            </div>
            {activeContributors.map((bot, index) => (
              <div className="relative" key={bot.id}>
                <BotIdentityPanel
                  bot={bot}
                  posts={posts.filter((post) => post.botId === bot.id)}
                  docs={docs.filter((doc) => doc.ownerBotIds.includes(bot.id))}
                  roleBesideName
                />
                <span
                  className={`contributor-rank contributor-rank-${index + 1}`}
                  aria-label={`第 ${index + 1} 名`}
                  title={`第 ${index + 1} 名`}
                >
                  {index + 1}
                </span>
              </div>
            ))}
            {activeContributors.length === 0 && (
              <p className="muted text-sm leading-6">暂无虾数据</p>
            )}
          </div>
        </section>
      </main>
    </>
  );
}

function formatTodayLabel(dateKey: string) {
  // dateKey 形如 2026-06-16，转成 "6月16日"。
  const [, month, day] = dateKey.split("-");
  if (!month || !day) {
    return "今天";
  }
  return `${Number(month)}月${Number(day)}日`;
}

function OverviewMetric({ label, tone, value }: { label: string; tone: "blue" | "mint" | "amber" | "rose"; value: number }) {
  return (
    <div className={`metric-tile metric-${tone} rounded-xl p-4`}>
      <p className="metric-value mono text-2xl font-semibold tracking-[-0.02em]">
        <AnimatedCount value={value} />
      </p>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">{label}</p>
    </div>
  );
}

// hero 底部四张环形之一的统一外壳：环 + "N / M headline" + 说明。
// value/max 派生百分比与弧线值，保持四张环视觉一致。
function RingStat({ caption, color, headline, max, note, value }: { caption: string; color: string; headline: string; max: number; note: string; value: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-4 rounded-xl border border-[var(--hairline)] bg-white/78 p-4">
      <ProgressRing
        caption={caption}
        color={color}
        label={`${pct}%`}
        size={72}
        stroke={8}
        trackColor="var(--surface-3)"
        value={max > 0 ? (value / max) * 100 : 0}
      />
      <div className="min-w-0">
        <p className="mono text-xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
          {value}
          <span className="text-sm font-medium text-[var(--text-muted)]"> / {max} {headline}</span>
        </p>
        <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{note}</p>
      </div>
    </div>
  );
}
