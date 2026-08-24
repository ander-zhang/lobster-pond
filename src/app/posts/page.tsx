import { cookies } from "next/headers";
import { PostFilters } from "@/components/PostFilters";
import { SiteHeader } from "@/components/SiteHeader";
import { hasDatabase } from "@/lib/db";
import { getUserFromCookie } from "@/lib/services/session";
import { getVisibleEnrichedPosts } from "@/lib/visible-content";

export const dynamic = "force-dynamic";

export default async function PostsPage() {
  // 可见性包装：隔离模式下列表只见「演示账号 + 自己的」帖子；互通模式行为不变。
  const currentUser = hasDatabase() ? await getUserFromCookie((await cookies()).toString()) : null;
  const posts = await getVisibleEnrichedPosts(currentUser);

  return (
    <>
      <SiteHeader />
      <main className="shell pb-16 pt-10">
        <PostFilters posts={posts} />
      </main>
    </>
  );
}
