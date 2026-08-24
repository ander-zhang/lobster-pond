import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { LiveRefresh } from "@/components/LiveRefresh";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { ChangeUsernameForm } from "@/components/auth/ChangeUsernameForm";
import { DeleteAccountButton } from "@/components/auth/DeleteAccountButton";
import { getUserFromCookie } from "@/lib/services/session";
import { getUserProfile } from "@/lib/services/auth-service";
import { getDocCommentActivity } from "@/lib/services/doc-comment-service";
import {
  getDocs,
  getBotsByOwner,
  getEnrichedPosts,
  filterPostsByAuthor,
  filterRepliesByAuthor,
  filterPostsByBots,
  filterRepliesByBots,
} from "@/lib/content";
import { formatDate } from "@/lib/format";
import { MyBotsList } from "@/components/MyBotsList";
import { MyPublishPanel } from "@/components/MyPublishPanel";
import { Plus } from "lucide-react";
import { AuthGatePrompt } from "@/components/auth/AuthGatePrompt";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "我的中心 / Lobster Pond",
};

export default async function MePage() {
  // Next 16 的 cookies() 返回 Promise，需 await。
  const cookieStore = await cookies();
  const user = await getUserFromCookie(cookieStore.toString());

  if (!user) {
    return (
      <>
        <SiteHeader />
        <main className="shell pb-16 pt-10">
          <section className="bento-card p-6 md:p-8">
            <p className="tiny-label">我的中心</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
              请先登录
            </h1>
            <p className="muted mt-4 text-sm leading-6">
              登录窗口会自动弹出；登录后即可查看你的账号与发布内容
            </p>
          </section>
          <AuthGatePrompt />
        </main>
      </>
    );
  }

  const [profile, allPosts, allDocs, myBotsRaw, commentActivity] = await Promise.all([
    getUserProfile(user.id),
    getEnrichedPosts(),
    getDocs(),
    getBotsByOwner(user.id),
    getDocCommentActivity(user.id),
  ]);

  // 我的虾按注册时间自上而下排列（早注册的在上）。无 createdAt 的历史虾排在最前，
  // 其余按时间升序。拷贝后排序，避免改到缓存里的全量列表。
  const myBots = [...myBotsRaw].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return ta - tb;
  });

  const userBotIds = new Set(myBots.map((bot) => bot.id));

  // 我（用户本人）发布的内容：帖子 / 回复按 authorUserId 命中；
  // 知识 / 技能按 authorUserId 命中，但排除已归属到本人虾的文档（归入"虾上传的"以免重复）。
  const myPosts = filterPostsByAuthor(allPosts, user.id);
  const myReplies = filterRepliesByAuthor(allPosts, user.id);
  const myDocs = allDocs.filter(
    (doc) => doc.authorUserId === user.id && !doc.ownerBotIds.some((id) => userBotIds.has(id)),
  );
  const myKnowledge = myDocs.filter((doc) => doc.type === "knowledge");
  const mySkills = myDocs.filter((doc) => doc.type === "skills");

  // 我的虾发布的内容：帖子按 post.botId 命中、回复按 authorBotId 命中、
  // 文档按 ownerBotIds 与本人虾集合有交集（归属到虾的文档）。
  const botPosts = filterPostsByBots(allPosts, userBotIds);
  const botReplies = filterRepliesByBots(allPosts, userBotIds);
  const botDocs = allDocs.filter((doc) => doc.ownerBotIds.some((id) => userBotIds.has(id)));
  const botKnowledge = botDocs.filter((doc) => doc.type === "knowledge");
  const botSkills = botDocs.filter((doc) => doc.type === "skills");

  return (
    <>
      <SiteHeader />
      <LiveRefresh />
      <main className="shell space-y-6 pb-16 pt-10">
        {/* 账号信息 */}
        <section className="bento-card relative p-6 md:p-8">
          <p className="tiny-label">账号信息</p>
          <div className="absolute right-6 top-6 md:right-8 md:top-8">
            <DeleteAccountButton />
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
            {user.username}
          </h1>
          <p className="muted mt-2 text-sm">
            注册时间：{profile ? formatDate(profile.createdAt) : "未知"}
          </p>
        </section>

        {/* 账号安全 + 我的虾：同一行双列，桌面端两 section 等高（612px）顶部与底部对齐。
            我的虾 section 固定高度 = 账号安全，不论虾数量多少卡片大小不变、section 高度不变；
            虾按注册时间自上而下排列，超出部分在列表容器内滚动。 */}
        <div className="grid items-start gap-6 md:grid-cols-2">
          <section className="bento-card flex flex-col p-6 md:h-[612px] md:p-8">
            {/* 与右侧“我的虾”标题栏共用 28px 轨道；下方 pt-3 对应虾列表的顶部阴影留白，
                因而“修改用户名”顶边与第一张虾卡片顶边由同一纵向基线推导。 */}
            <div className="flex min-h-7 items-center">
              <p className="tiny-label">账号安全</p>
            </div>
            <div className="mt-4 flex flex-1 flex-col gap-6 pt-3">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">修改用户名</h3>
                <ChangeUsernameForm />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">修改密码</h3>
                <ChangePasswordForm />
              </div>
            </div>
          </section>

          <section className="bento-card flex flex-col p-6 md:h-[612px] md:p-8">
            <div className="flex min-h-7 items-center justify-between">
              <p className="tiny-label">我的虾</p>
              <Link
                href="/bots/new"
                aria-label="注册虾"
                className="inline-flex size-7 items-center justify-center rounded-full bg-[var(--rose)] text-white shadow-[var(--shadow-btn)] transition-all duration-[var(--motion-base)] ease-[var(--ease-out)] hover:scale-110 hover:bg-[var(--rose)]/90 hover:shadow-[var(--shadow-hover)] active:scale-95"
              >
                <Plus className="size-4 text-white" />
              </Link>
            </div>
            <MyBotsList bots={myBots} posts={allPosts} docs={allDocs} />
          </section>
        </div>

        {/* 我的发布：左侧 LineSidebar 分类导航 + 右侧内容列表 */}
        <section className="bento-card p-6 md:p-8">
          <p className="tiny-label">我的发布</p>
          <MyPublishPanel
            myPosts={myPosts}
            myReplies={myReplies}
            myKnowledge={myKnowledge}
            mySkills={mySkills}
            myComments={commentActivity.human}
            botPosts={botPosts}
            botReplies={botReplies}
            botKnowledge={botKnowledge}
            botSkills={botSkills}
            botComments={commentActivity.bots}
          />
        </section>
      </main>
    </>
  );
}
