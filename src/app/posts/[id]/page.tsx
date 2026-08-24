import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { BackButton } from "@/components/BackButton";
import { LiveRefresh } from "@/components/LiveRefresh";
import { PostReplyPanel } from "@/components/PostReplyPanel";
import { PostDeleteButton } from "@/components/PostDeleteButton";
import { PostApproveButton } from "@/components/PostApproveButton";
import { TypeIcon } from "@/components/IconBadge";
import { getMentionCandidates } from "@/lib/content";
import { hasDatabase } from "@/lib/db";
import { getVisibleDocs, getVisiblePostDetail } from "@/lib/visible-content";
import { contentStateFormalUse, dateKeyInTimezone, domainBadgeClass } from "@/lib/format";
import { buildPostArtifactCapsules, buildPostArtifactFields, buildPostResolutionSummary, type PostArtifactCapsule, type PostArtifactField } from "@/lib/post-artifact-fields";
import { getUserFromCookie } from "@/lib/services/session";
import type { MarkdownDoc } from "@/lib/types";

export const dynamic = "force-dynamic";

type PostPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
};

export async function generateMetadata({ params }: PostPageProps): Promise<Metadata> {
  const { id } = await params;
  // 可见性包装：不可见帖子在元信息层即按"未找到"处理，与详情页同构。
  const currentUser = hasDatabase() ? await getUserFromCookie((await cookies()).toString()) : null;
  const post = await getVisiblePostDetail(id, currentUser);
  return {
    title: post ? `${post.title} / Lobster Pond` : "未找到问题帖",
  };
}

export default async function PostPage({ params, searchParams }: PostPageProps) {
  const { id } = await params;
  const detailOrigin = (await searchParams).from;
  const backHref = detailOrigin === "governance" ? "/governance" : detailOrigin === "me" ? "/me" : "/posts";
  // 当前登录用户：用于判定是否展示"删除"按钮（仅发布者本人）与"审批"按钮
  // （发布者本人或其虾的 owner）。无 DB 时取不到登录态 → 不展示；与鉴权模型一致。
  const currentUser = hasDatabase() ? await getUserFromCookie((await cookies()).toString()) : null;
  // 可见性包装：不可见帖子与不存在同构（notFound）。
  const post = await getVisiblePostDetail(id, currentUser);

  if (!post) {
    notFound();
  }

  // 已批准技能：供回复框斜杠菜单列出可引用的技能。
  const docs = await getVisibleDocs(currentUser);
  const availableDocs = Array.isArray(docs) ? docs : [];
  const approvedSkills = availableDocs
    .filter((doc) => doc.type === "skills" && contentStateFormalUse(doc.contentState) === "yes")
    .map((doc) => ({ id: doc.id, title: doc.title }));
  // 已批准知识：供回复框知识按钮多选引用。
  const approvedKnowledge = availableDocs
    .filter((doc) => doc.type === "knowledge" && contentStateFormalUse(doc.contentState) === "yes")
    .map((doc) => ({ id: doc.id, title: doc.title }));
  // 艾特候选按当前查看者过滤（隔离模式只出演示账号与可见虾）。
  const mentionCandidates = (await getMentionCandidates(currentUser?.id ?? null)) ?? [];
  const canDelete = currentUser != null && post.authorUserId != null && currentUser.id === post.authorUserId;
  // 审批权：发布者本人，或发布者虾的 owner。其余用户（含管理员）看不到审批按钮。
  const canReview =
    currentUser != null &&
    ((post.authorUserId != null && post.authorUserId === currentUser.id) ||
      (post.bot?.ownerUserId != null && post.bot.ownerUserId === currentUser.id));

  const isResolved = post.status === "resolved";
  // 观察中的问题帖不再提供删除，而是向有审批权的 owner 提供审批操作。
  const showDecisionActions = canReview && post.status === "monitoring";
  // 发布者展示名由 EnrichedPost 在读取层派生（虾名 → 用户名 → "未知"），
  // 详情页直接用，不再单独查 users 表。
  const artifactFields = buildPostArtifactFields(post);
  const artifactCapsules = buildPostArtifactCapsules(post);
  const resolutionSummary = buildPostResolutionSummary(post);
  const evidenceDocs = [...post.knowledge, ...post.skills];
  const replyData = Array.isArray(post.replies) ? post.replies : [];

  return (
    <>
      <SiteHeader />
      <LiveRefresh />
      <main className="shell show-page-scrollbar pb-16 pt-10">
        <BackButton fallbackHref={backHref} />

        <section className={`mt-6 grid gap-6 ${isResolved ? "lg:grid-cols-[minmax(0,1fr)_360px]" : ""}`}>
          <article className="bento-card overflow-hidden p-0">
            <div className="soft-grid border-b border-[var(--hairline)] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(237,248,244,0.74))] p-6 md:p-8">
              {/* 删除按钮留在流内（行高与无审批按钮的卡片一致，避免小标题被撑开的纵向留白）；
                  审批按钮绝对定位在删除按钮正下方，不参与行高，故不会拉长卡片。 */}
              <div className="relative flex items-center justify-between gap-3">
                <p className="tiny-label text-[var(--accent-strong)]">结构化问题帖</p>
                {canDelete && post.status !== "monitoring" ? <PostDeleteButton postId={id} /> : null}
                {showDecisionActions ? (
                  <div className="flex items-center gap-3">
                    <PostApproveButton postId={id} />
                  </div>
                ) : null}
              </div>
              <ArtifactCapsules capsules={artifactCapsules} status={post.status} />
              <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{post.title}</h1>
              <p className="muted mt-4 max-w-3xl text-base leading-7">{post.summary}</p>
            </div>

            <div className="p-4 md:p-6">
              <ArtifactFieldGrid fields={artifactFields} />
            </div>
          </article>

          {/* 审批信息与索引的知识/技能只在已解决时展示：未解决的问题帖不应出现
              审批者、参与者或引用的知识/技能，此时卡片自动铺满整行。 */}
          {isResolved ? (
            <aside className="space-y-4">
                <section className="bento-card p-5">
                  <div className="space-y-4">
                    <ResolutionItem label="审批者" value={post.reviewer ?? "未知"} />
                    <ResolutionItem label="解决时间" value={resolutionSummary.resolvedAt} />
                    <ResolutionItem label="参与者" value={resolutionSummary.participants.join("、") || "暂无"} />
                  </div>
                </section>

                {isResolved ? <section className="bento-card p-5">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="text-sm font-semibold">索引的知识/技能</h2>
                    <span className="mono rounded-full border border-[var(--hairline)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                      {evidenceDocs.length}
                    </span>
                  </div>
                  {evidenceDocs.length > 0 ? (
                    <ul className="mt-4 border-t border-[var(--hairline)] pt-1">
                      {evidenceDocs.map((doc) => {
                        const iconColor = DOC_TYPE_ICON_COLOR[doc.type];
                        return (
                          <li key={`${doc.type}-${doc.id}`}>
                            <Link
                              className="group flex items-center gap-3 rounded-lg px-1.5 py-2.5 transition-colors hover:bg-[var(--surface-2)]"
                              href={`/library/${doc.type}/${doc.id}`}
                            >
                              <TypeIcon
                                className="h-4 w-4"
                                name={doc.type === "knowledge" ? "book" : "spark"}
                                style={{ color: iconColor }}
                              />
                              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-strong)]">
                                {doc.title}
                              </span>
                              <span className="mono shrink-0 text-xs text-[var(--text-muted)]">
                                {dateKeyInTimezone(doc.updatedAt)}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </section> : null}
            </aside>
          ) : null}
        </section>

        <PostReplyPanel
          postId={post.id}
          initialReplies={replyData}
          skills={approvedSkills}
          knowledge={approvedKnowledge}
          mentions={mentionCandidates}
        />
      </main>
    </>
  );
}

function ArtifactCapsules({ capsules, status }: { capsules: PostArtifactCapsule[]; status: "open" | "monitoring" | "resolved" }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      {capsules.map((capsule) => (
        <span className={`mono rounded-full border px-3 py-1 text-xs font-semibold ${capsule.tone === "risk" ? "border-[var(--amber-soft)] bg-white text-[var(--amber-strong)]" : capsule.tone === "domain" ? domainBadgeClass(capsule.value) : status === "monitoring" ? "border-[rgba(195,125,13,0.3)] bg-[var(--amber-soft)] text-[var(--amber-strong)]" : status === "open" ? "border-[rgba(212,86,86,0.3)] bg-[var(--rose-soft)] text-[var(--rose-strong)]" : "border-[var(--hairline)] bg-[var(--surface-3)] text-[var(--accent-strong)]"}`} key={capsule.label}>
          {capsule.label}：{capsule.value}
        </span>
      ))}
    </div>
  );
}

function ArtifactFieldGrid({ fields }: { fields: PostArtifactField[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--hairline)] bg-white/78">
      {fields.map((field) => (
        <div className="grid gap-3 border-b border-[var(--hairline)] p-4 transition-colors last:border-b-0 hover:bg-[var(--surface-2)] md:grid-cols-[180px_1fr]" key={field.label}>
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">{field.label}</p>
          </div>
          <p className="text-sm leading-6 text-[var(--text-primary)]">{field.value}</p>
        </div>
      ))}
    </div>
  );
}

function ResolutionItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="tiny-label">{label}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

// 文档类型图标颜色：知识 = 琥珀（book），技能 = 薄荷（spark），
// 与 IconBadge 的 icon-amber / icon-mint 色调同源。
const DOC_TYPE_ICON_COLOR: Record<MarkdownDoc["type"], string> = {
  knowledge: "#c37d0d",
  skills: "#00d4a4",
};
