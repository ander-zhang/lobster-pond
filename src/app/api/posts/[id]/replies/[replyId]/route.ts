import { NextResponse } from "next/server";
import { deleteReply } from "@/lib/services/post-service";
import { getCurrentUser } from "@/lib/services/session";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; replyId: string }> };

// 删除一条回复。授权由服务端判定：仅发布者本人可删（管理员删任意回复的能力已移除）。
// 附件经外键 on delete cascade 自动清除。前端按钮显隐只是 UI 便利，非安全边界。
export async function DELETE(request: Request, context: RouteContext) {
  const { id, replyId } = await context.params;

  const currentUser = await getCurrentUser(request);
  let result;
  try {
    result = await deleteReply(id, replyId, currentUser);
  } catch (err) {
    // deleteReply 会写库；DB 抛错（约束违反、连接失败等）此前会冒泡成无信息的 500。
    // 这里捕获并记录真实原因，向前端回通用文案。
    console.error("[DELETE /api/posts/[id]/replies/[replyId]] deleteReply failed:", err);
    return NextResponse.json(
      { ok: false, error: "删除失败，请稍后重试；若持续失败请查看服务端日志。" },
      { status: 500 },
    );
  }
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, id: result.data.id }, { status: 200 });
}
