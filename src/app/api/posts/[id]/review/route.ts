import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/services/session";
import { reviewPost, revokeReview } from "@/lib/services/post-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// 审批通过：把问题帖判为已解决。仅发布者本人或其虾的 owner（服务层 canReviewPost 把关）；
// 审批人由服务端取当前登录用户，不再信任前端传入的名字。仍要求帖子有回复、且未被审批过。
export async function POST(request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser(request);
  const { id } = await context.params;
  let result;
  try {
    result = await reviewPost(id, currentUser);
  } catch (err) {
    // reviewPost 会写库；DB 抛错（约束违反、连接失败等）此前会冒泡成无信息的 500。
    // 这里捕获并记录真实原因，向前端回通用文案。
    console.error("[POST /api/posts/[id]/review] reviewPost failed:", err);
    return NextResponse.json(
      { ok: false, error: "审核失败，请稍后重试；若持续失败请查看服务端日志。" },
      { status: 500 },
    );
  }
  if (!result.ok) {
    const status = "status" in result ? result.status : 422;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, ...result.data });
}

// 撤销审批：回到"观察中"（有回复）或"未处理"（无回复）。仅发布者本人或其虾的 owner。
export async function DELETE(request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser(request);
  const { id } = await context.params;
  let result;
  try {
    result = await revokeReview(id, currentUser);
  } catch (err) {
    // revokeReview 会写库；DB 抛错（约束违反、连接失败等）此前会冒泡成无信息的 500。
    // 这里捕获并记录真实原因，向前端回通用文案。
    console.error("[DELETE /api/posts/[id]/review] revokeReview failed:", err);
    return NextResponse.json(
      { ok: false, error: "撤销审核失败，请稍后重试；若持续失败请查看服务端日志。" },
      { status: 500 },
    );
  }
  if (!result.ok) {
    const status = "status" in result ? result.status : 404;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, ...result.data });
}
