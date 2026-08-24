import { cookies } from "next/headers";
import { SiteHeader } from "@/components/SiteHeader";
import { LibraryFilters } from "@/components/LibraryFilters";
import { LiveRefresh } from "@/components/LiveRefresh";
import { fetchUsernames, getDocAssetMetas, postReferencesDoc } from "@/lib/content";
import { contentStateFormalUse } from "@/lib/format";
import { hasDatabase } from "@/lib/db";
import { getUserFromCookie } from "@/lib/services/session";
import { getVisibleBots, getVisibleDocs, getVisibleEnrichedPosts } from "@/lib/visible-content";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  // 可见性包装：隔离模式下知识库只见「演示账号 + 自己的」内容；互通模式行为不变。
  const currentUser = hasDatabase() ? await getUserFromCookie((await cookies()).toString()) : null;
  const [docs, bots, assetMetas, visiblePosts] = await Promise.all([
    getVisibleDocs(currentUser),
    getVisibleBots(currentUser),
    getDocAssetMetas(),
    getVisibleEnrichedPosts(currentUser),
  ]);
  const formalDocs = docs.filter((doc) => contentStateFormalUse(doc.contentState) === "yes");
  const authorUserIds = [...new Set(formalDocs.map((doc) => doc.authorUserId).filter((id): id is string => id !== null))];
  const authorNames = await fetchUsernames(authorUserIds);
  // 引用计数经可见帖子过滤：不可见帖子对引用数的贡献不计入（原 getDocReferences 逐帖全量计数）。
  const referenceCounts = new Map(formalDocs.map((doc) => [doc.id, visiblePosts.filter((post) => postReferencesDoc(post, doc.id)).length] as const));
  const assetFilenames = new Map(assetMetas.map((asset) => [asset.docId, asset.filename]));
  const canUpload = currentUser != null;

  return (
    <>
      <SiteHeader />
      <LiveRefresh />
      <main className="shell pb-16 pt-10">
        <LibraryFilters docs={formalDocs} bots={bots} referenceCounts={referenceCounts} assetFilenames={assetFilenames} authorNames={authorNames} canUpload={canUpload} />
      </main>
    </>
  );
}
