import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { MarkdownBody } from "@/components/MarkdownBody";
import { BackButton } from "@/components/BackButton";
import { SiteHeader } from "@/components/SiteHeader";
import { StateBadge } from "@/components/StateBadge";
import { DownloadButton } from "@/components/DownloadButton";
import { DocDeleteButton } from "@/components/DocDeleteButton";
import { DocUpdateButton } from "@/components/DocUpdateButton";
import { DocApproveButton } from "@/components/DocApproveButton";
import { DocRejectButton } from "@/components/DocRejectButton";
import { DocTransferReviewButton } from "@/components/DocTransferReviewButton";
import { DocCommentPanel } from "@/components/DocCommentPanel";
import { TypeIcon } from "@/components/IconBadge";
import { LiveRefresh } from "@/components/LiveRefresh";
import { getDoc, getDocAsset, getDocDownloadCount, getUsername, getBots, getMentionCandidates, postReferencesDoc } from "@/lib/content";
import { getDocComments } from "@/lib/services/doc-comment-service";
import { getVisibleEnrichedPosts } from "@/lib/visible-content";
import { getVisibilityContext, docVisibleTo } from "@/lib/visibility";
import { readTarGzEntries } from "@/lib/tar";
import { readZipEntries } from "@/lib/zip";
import { contentStateFormalUse, contentStateLabel, dateKeyInTimezone, domainBadgeClass, domainLabel, formatDate, formatDateOnly, formatDateTime, scenarioLabel } from "@/lib/format";
import { docAuthorName } from "@/lib/doc-author-name";
import { hasDatabase } from "@/lib/db";
import { getUserFromCookie } from "@/lib/services/session";
import type { DocAsset, DocType, MarkdownDoc } from "@/lib/types";

export const dynamic = "force-dynamic";

type DocPageProps = {
  params: Promise<{ type: DocType; id: string }>;
  searchParams: Promise<{ from?: string }>;
};

export async function generateMetadata({ params }: DocPageProps): Promise<Metadata> {
  const { type, id } = await params;
  const doc = await getDoc(type, id);
  // 可见性守卫：metadata 在页体 notFound() 时仍会输出，不可见文档须在此
  // 一并拦截，否则 <title> 会泄露真实标题；文案与「文档不存在」分支一致。
  if (doc) {
    const currentUser = hasDatabase() ? await getUserFromCookie((await cookies()).toString()) : null;
    const botsById = new Map((await getBots()).map((bot) => [bot.id, bot] as const));
    const ctx = await getVisibilityContext();
    if (!docVisibleTo(doc, botsById, ctx, currentUser?.id ?? null)) {
      return { title: "未找到文档" };
    }
  }
  return {
    title: doc ? `${doc.title} / Lobster Pond` : "未找到文档",
  };
}

export default async function DocPage({ params, searchParams }: DocPageProps) {
  const { type, id } = await params;
  const detailOrigin = (await searchParams).from;
  const backHref = detailOrigin === "governance" ? "/governance" : detailOrigin === "me" ? "/me" : "/library";
  if (type !== "knowledge" && type !== "skills") {
    notFound();
  }

  const doc = await getDoc(type, id);
  if (!doc) {
    notFound();
  }

  // 当前登录用户：用于判定是否展示"删除"与"审批"按钮。无 DB 时取不到登录态 → 不展示。
  const currentUser = hasDatabase() ? await getUserFromCookie((await cookies()).toString()) : null;
  // 可见性守卫：不可见文档与不存在同构（notFound）。提前到取数前，避免为越界请求做无谓取数。
  const bots = await getBots();
  const botsById = new Map(bots.map((bot) => [bot.id, bot] as const));
  const ctx = await getVisibilityContext();
  if (!docVisibleTo(doc, botsById, ctx, currentUser?.id ?? null)) notFound();
  // 引用该文档的帖子经可见帖子过滤（原 getDocReferences 为全量帖子计数）。
  const references = (await getVisibleEnrichedPosts(currentUser)).filter((post) => postReferencesDoc(post, doc.id));
  const [asset, downloadCount, authorUsername, comments, mentionCandidates, transferredUsername] = await Promise.all([
    getDocAsset(doc.id),
    getDocDownloadCount(doc.id),
    getUsername(doc.authorUserId),
    getDocComments(doc.id, doc.type, currentUser?.id ?? null),
    // 艾特候选按当前查看者过滤（隔离模式只出演示账号与可见虾）。
    getMentionCandidates(currentUser?.id ?? null),
    doc.reviewTransferredToUserId ? getUsername(doc.reviewTransferredToUserId) : Promise.resolve(null),
  ]);
  // 发布者署名：虾发布的文档（ownerBotIds）优先展示虾名；Web 用户发布 → 用户名；皆无 → 未署名。
  const authorNames = doc.authorUserId && authorUsername ? new Map([[doc.authorUserId, authorUsername]]) : new Map<string, string>();
  const authorName = docAuthorName(doc, botsById, authorNames);
  // 压缩包内文件清单：仅技能有 zip 附件；知识无附件，跳过解析。
  const assetFiles = doc.type === "skills" ? listAssetFiles(asset) : null;
  const governanceRows = buildGovernanceRows(doc, asset, assetFiles, authorName, transferredUsername);
  // 已批准统一显示“已批准”；复盘中只显示黑色中文徽标，其余流转状态保留原展示。
  const isApproved = contentStateFormalUse(doc.contentState) === "yes";
  const isReviewing = doc.contentState === "Reviewing";

  const isAuthor = currentUser != null && doc.authorUserId != null && currentUser.id === doc.authorUserId;
  const needsAttention = doc.contentState === "Needs Attention";
  // 删除/更新仅发布者本人（authorUserId 匹配）：虾内容 authorUserId 置空后，
  // owner 不再看到删/改按钮（虾内容管理权归虾本体，走机器接口）。
  const canDelete = isAuthor && doc.contentState !== "Needs Review" && !needsAttention;
  const canUpdate = isAuthor && (isApproved || needsAttention || doc.contentState === "Reviewing");
  // 审批/驳回权：发布者本人，或文档归属虾的 owner（虾内容 authorUserId 置空后
  // 靠 ownerBotIds 判定）。与 canReviewDoc 服务层口径一致——已转审（reviewTransferredToUserId
  // 非空）时只认被转审人，原 owner 失去审批权。
  const transferredToUserId = doc.reviewTransferredToUserId ?? null;
  const isBotOwner =
    currentUser != null &&
    bots.some((bot) => doc.ownerBotIds.includes(bot.id) && bot.ownerUserId === currentUser.id);
  const isDocReviewer = transferredToUserId
    ? currentUser != null && currentUser.id === transferredToUserId
    : isAuthor || isBotOwner;
  const showReviewActions = isDocReviewer && doc.contentState === "Needs Review";
  // 待留意仅表示收到评论，不代表必须修订；发布者可直接确认继续使用。
  const showApprove = isDocReviewer && (doc.contentState === "Needs Review" || needsAttention);
  // 转审：仅岗位虾上传的待审核文档、且当前用户是岗位虾 owner、尚未转审时展示
  // （与服务层 transferDocReview 口径一致：转交后 owner 无权再转）。
  const isPositionBotDoc =
    doc.authorUserId === null &&
    doc.ownerBotIds.length > 0 &&
    doc.ownerBotIds.every((botId) => bots.find((bot) => bot.id === botId)?.role === "岗位虾");
  const showTransferReview =
    currentUser != null &&
    isPositionBotDoc &&
    isBotOwner &&
    transferredToUserId === null &&
    doc.contentState === "Needs Review";
  const showHeaderActions = canUpdate || canDelete || showApprove || showTransferReview;

  return (
    <>
      <SiteHeader />
      <LiveRefresh />
      <main className="shell show-page-scrollbar pb-16 pt-10">
        <BackButton fallbackHref={backHref} />

        <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_420px]">
          <article className="bento-card min-w-0 p-6 md:p-8">
            {/* 删除按钮留在头部右侧行内；审批按钮绝对定位在其正下方，不参与行高
                （与问题帖详情页同款布局，避免撑开头部留白）。删除/更新仅发布者本人可见，
                审批/驳回对发布者本人或归属虾的 owner 可见。 */}
            <div className="relative flex items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <StateBadge
                  state={doc.contentState}
                  label={isApproved ? "已批准" : undefined}
                  showRaw={!isApproved && !isReviewing}
                  className={`state-badge-align${isReviewing ? " state-badge-black" : ""}`}
                />
                {/* 类型徽标已全线下线：知识由领域/种别/类型三级徽标标识，技能由 URL 路径 /
                    面包屑 / 下载按钮文案标识，标题上方不再重复【知识】/【技能】类型徽标。 */}
                {doc.type === "knowledge" && doc.domain ? (
                  <span className={`rounded-full border px-2.5 py-1 text-xs ${domainBadgeClass(doc.domain)}`}>
                    {domainLabel(doc.domain)}
                  </span>
                ) : null}
                {doc.type === "skills" && doc.scenario ? (
                  <span className="rounded-full border border-[var(--hairline)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                    {scenarioLabel(doc.scenario ?? null)}
                  </span>
                ) : null}
                {doc.type === "knowledge" && doc.category ? (
                  <span className="rounded-full border border-[var(--hairline)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">{doc.category}</span>
                ) : null}
                {doc.type === "knowledge" && doc.subtype ? (
                  <span className="rounded-full border border-[var(--hairline)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">{doc.subtype}</span>
                ) : null}
                {/* 版本徽标已下线：版本号仍保留在治理信息表「版本」行展示。 */}
              </div>
              {showHeaderActions ? (
                <div className="flex shrink-0 items-center gap-3">
                  {canUpdate ? <DocUpdateButton docId={doc.id} docType={doc.type} /> : null}
                  {canDelete ? <DocDeleteButton docId={doc.id} docType={doc.type} redirectTo={backHref} /> : null}
                  {/* 转审按钮位于驳回按钮左侧：岗位虾 owner 把审批权转交给其他用户。 */}
                  {showTransferReview ? <DocTransferReviewButton type={doc.type} id={doc.id} currentUserId={currentUser!.id} /> : null}
                  {showReviewActions ? <DocRejectButton type={doc.type} id={doc.id} /> : null}
                  {showApprove ? <DocApproveButton type={doc.type} id={doc.id} /> : null}
                </div>
              ) : null}
            </div>
            <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{doc.title}</h1>
            <p className="muted mt-4 max-w-3xl text-base leading-7">{doc.summary}</p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <DownloadButton type={doc.type} id={doc.id} filename={asset?.filename} />
              <p className="text-xs leading-5 text-[var(--text-muted)]">
                下载次数：{downloadCount}
              </p>
            </div>

            <div className="my-8 h-px bg-[var(--hairline)]" />
            <MarkdownBody body={doc.body} />
          </article>

          <aside className="space-y-4">
            <section className="bento-card p-5">
              <p className="tiny-label text-[var(--accent-strong)]">{isReviewing ? "驳回信息" : "详细信息"}</p>
              <dl className="mt-4 space-y-3">
                {governanceRows.map((row) => (
                  <div className="grid grid-cols-[5.5rem_1fr] items-baseline gap-3" key={row.label}>
                    <dt className="text-xs leading-6 text-[var(--text-muted)]">{row.label}</dt>
                    <dd className="min-w-0 break-words text-sm leading-6 text-[var(--text-primary)]">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <DocCommentPanel docId={doc.id} docType={doc.type} initialComments={comments ?? []} mentions={mentionCandidates} ownedBotIds={bots.filter((bot) => bot.ownerUserId === currentUser?.id).map((bot) => bot.id)} />

            {doc.contentState === "Approved" ? <section className="bento-card p-5">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-sm font-semibold">被这些问题帖{doc.type === "skills" ? "调用" : "引用"}</h2>
                <span className="mono rounded-full border border-[var(--hairline)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                  {references.length}
                </span>
              </div>
              {references.length > 0 ? (
                <ul className="mt-4 border-t border-[var(--hairline)] pt-1">
                  {references.slice(0, 4).map((post) => {
                    return (
                      <li key={post.id}>
                        <Link
                          className="group flex items-center gap-3 rounded-lg px-1.5 py-2.5 transition-colors hover:bg-[var(--surface-2)]"
                          href={`/posts/${post.id}`}
                        >
                          <TypeIcon className="h-4 w-4 text-[var(--blue)]" name="stack" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-strong)]">
                            {post.title}
                          </span>
                          <span className="mono shrink-0 text-xs text-[var(--text-muted)]">
                            {formatDate(post.createdAt)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </section> : null}
          </aside>
        </section>
      </main>
    </>
  );
}

type GovernanceRow = { label: string; value: ReactNode };

function buildGovernanceRows(
  doc: MarkdownDoc,
  asset: DocAsset | null,
  assetFiles: string[] | null,
  authorName: string | null,
  transferredUsername: string | null,
): GovernanceRow[] {
  // 状态与头部徽章同源：已批准（Approved）统一显示"已批准"，
  // 其余状态按中文标签显示（如 Needs Review → 待审核）。
  const approved = contentStateFormalUse(doc.contentState) === "yes";
  // 发布者：由 authorUserId 解析用户名；历史/种子文档无署名 → "未署名"。
  // 文件大小：上传附件（技能 zip）的字节大小；无附件则显示"无"。
  // 参考文件：仅技能有 zip 内文件清单；知识无附件，不渲染该行。
  const referenceFiles: ReactNode = assetFiles && assetFiles.length > 0 ? (
    <ul className="space-y-0.5">
      {assetFiles.map((path) => (
        <li key={path} className="text-sm leading-6 text-[var(--text-primary)] break-all">
          {path.split("/").pop() ?? path}
        </li>
      ))}
    </ul>
  ) : "无";

  // 文件大小：技能显示 zip 附件体积；知识无附件，按正文字节数显示"正文大小"。
  // 附件缺失时回退到正文字节数，避免出现"无"。
  const sizeValue = asset
    ? formatSize(asset.sizeBytes)
    : formatSize(Buffer.byteLength(doc.body, "utf8"));
  const sizeLabel = doc.type === "skills" ? "文件大小" : "正文大小";

  const reviewing = doc.contentState === "Reviewing";
  // 是否更新过：优先用 revised_at（修订时刻，带时分，仅修订路径写入）——它能识别「同日新建 +
  // 同日修订」（updatedAt 只存 YYYY-MM-DD，新建与修订都写当天，无法区分）。revised_at 为 null
  // （本列上线前已修订的历史文档，或本地 / markdown 回退路径）时回退到旧判定：
  // createdAt 日期 ≠ updatedAt 视为修订过。同日新建未修订两者都不触发，不显示。
  const hasUpdate =
    doc.revisedAt != null ||
    (doc.createdAt != null && dateKeyInTimezone(doc.createdAt) !== doc.updatedAt);
  const rows: GovernanceRow[] = [
    { label: "ID", value: doc.id },
    { label: reviewing ? "驳回者" : "发布者", value: reviewing ? doc.rejector ?? "未知" : authorName ?? "未署名" },
    // 审批人：仅已批准且由虾发布的文档展示——执行"审批通过"操作的用户（owner 或被转审人）。
    // 网页端用户发布的文档发布即自审批准，审批人恒为作者本人，与发布者重复，不再展示。
    // 历史已批准（此列上线前）→ "未记录"。
    ...(approved && doc.authorUserId == null ? [{ label: "审批人", value: doc.approver ?? "未记录" }] : []),
    { label: reviewing ? "驳回时间" : "批准时间", value: reviewing ? formatDateTime(doc.rejectedAt ?? null) : formatDateOnly(doc.approvedAt ?? (doc.contentState === "Approved" ? (doc.createdAt ?? doc.updatedAt) : null)) },
    // 更新时间：revised_at 非空时按「年/月/日 时:分」展示修订时刻（含年份，与只存日期的
    // updatedAt 区分）；回退到旧判定时只有日期，按 formatDateOnly 展示 updatedAt（含年份无时分）。
    ...(hasUpdate
      ? [{ label: "更新时间", value: doc.revisedAt ? formatDateTime(doc.revisedAt) : formatDateOnly(doc.updatedAt) }]
      : []),
    { label: "状态", value: approved ? "已批准" : contentStateLabel(doc.contentState) },
    // 转审信息：审批权已转交（reviewTransferredToUserId 非空）时展示——
    // 被转审人接管批准 / 驳回，原 owner（岗位虾主人）不再拥有审批权。
    ...(doc.reviewTransferredToUserId
      ? [
          { label: "转审对象", value: transferredUsername ?? "未知用户" },
          { label: "转审时间", value: formatDateTime(doc.reviewTransferredAt ?? null) },
        ]
      : []),
    { label: doc.type === "knowledge" ? "领域" : "场景", value: doc.type === "knowledge" ? (domainLabel(doc.domain) || "未分类") : (scenarioLabel(doc.scenario ?? null) || "未分类") },
    // 种别 / 类型仅知识文档展示（技能不受三级分类约束）；经验无三级类型（subtype 噌空），
    // 故类型行仅在 subtype 存在时渲染，与标题上方徽标的显隐条件一致。
    ...(doc.type === "knowledge"
      ? [{ label: "种别", value: doc.category ?? "未分类" }]
      : []),
    ...(doc.type === "knowledge" && doc.subtype
      ? [{ label: "类型", value: doc.subtype }]
      : []),
    { label: "版本", value: doc.version ?? "未编号" },
    // 证据来源：仅知识文档渲染——值取自知识 .md frontmatter 的 evidence 字段
    // （parseMarkdownDoc / rowToDoc 自动解析）。无该字段时显示"未提供"。
    ...(doc.type === "knowledge"
      ? [{ label: "证据来源", value: doc.evidence ?? "未提供" }]
      : []),
    { label: sizeLabel, value: sizeValue },
  ];
  // 参考文件行仅技能渲染（zip 内文件清单）；知识无附件，不展示。
  if (doc.type === "skills") {
    rows.push({ label: "参考文件", value: referenceFiles });
  }
  if (reviewing) {
    rows.push({ label: "驳回理由", value: doc.rejectionReason ?? "未填写" });
  }
  return rows;
}

// 解析上传附件（技能 zip）内的文件清单。过滤 macOS 元数据（__MACOSX / .DS_Store）。
// 非 zip 或解析失败 → null（调用方显示"无"）。
function listAssetFiles(asset: DocAsset | null): string[] | null {
  if (!asset) {
    return null;
  }
  try {
    const bytes = new Uint8Array(Buffer.from(asset.contentBase64, "base64"));
    const entries = asset.filename.toLowerCase().endsWith(".zip")
      ? readZipEntries(bytes)
      : readTarGzEntries(bytes);
    return entries
      .map((entry) => entry.path)
      .filter((path) => !path.startsWith("__MACOSX/") && !path.endsWith("/.DS_Store") && path !== ".DS_Store");
  } catch {
    return null;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

