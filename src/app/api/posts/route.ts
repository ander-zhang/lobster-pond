import { NextResponse } from "next/server";
import { getPostListVersion } from "@/lib/post-list-state";
import { publishPost } from "@/lib/services/post-service";
import { deletePost } from "@/lib/services/delete-service";
import { requireUser } from "@/lib/route-auth";
import { getCurrentUser } from "@/lib/services/session";
import { getVisibleEnrichedPosts } from "@/lib/visible-content";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // 可见性包装：隔离模式下列表只见「演示账号 + 自己的」帖子；互通模式行为不变。
  const currentUser = await getCurrentUser(request);
  const posts = await getVisibleEnrichedPosts(currentUser);

  return NextResponse.json({
    posts,
    version: getPostListVersion(posts),
  });
}

export async function POST(request: Request) {
  const currentUser = await requireUser(request);
  if (currentUser instanceof NextResponse) return currentUser;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法的 JSON" }, { status: 400 });
  }

  let result;
  try {
    result = await publishPost(body, currentUser);
  } catch (err) {
    // publishPost 在事务里写库；DB 抛错（约束违反、连接失败等）此前会冒泡成
    // 无信息的 500。这里捕获并记录真实原因，向前端回通用文案。
    console.error("[POST /api/posts] publishPost failed:", err);
    return NextResponse.json(
      { ok: false, error: "发布失败，请稍后重试；若持续失败请查看服务端日志。" },
      { status: 500 },
    );
  }
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }
  return NextResponse.json({ ok: true, post: result.data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const currentUser = await requireUser(request);
  if (currentUser instanceof NextResponse) return currentUser;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, error: "缺少 id 查询参数" }, { status: 400 });
  }

  let result;
  try {
    result = await deletePost(id, currentUser);
  } catch (err) {
    // deletePost 会写库；DB 抛错（约束违反、连接失败等）此前会冒泡成无信息的 500。
    // 这里捕获并记录真实原因，向前端回通用文案。
    console.error("[DELETE /api/posts] deletePost failed:", err);
    return NextResponse.json(
      { ok: false, error: "删除失败，请稍后重试；若持续失败请查看服务端日志。" },
      { status: 500 },
    );
  }
  if (!result.ok) {
    const status = "status" in result ? result.status : 404;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, id: result.data.id });
}
