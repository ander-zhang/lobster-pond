import { NextResponse } from "next/server";
import { deleteDocComment } from "@/lib/services/doc-comment-service";
import { getCurrentUser } from "@/lib/services/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ type: string; id: string; commentId: string }> };

// 删除一条文档评论。按钮显隐只是 UI 便利，服务端仍按持久化的作者 id 鉴权。
export async function DELETE(request: Request, context: RouteContext) {
  const { type, id, commentId } = await context.params;
  if (type !== "knowledge" && type !== "skills") {
    return NextResponse.json({ ok: false, error: "文档类型无效" }, { status: 400 });
  }

  const currentUser = await getCurrentUser(request);
  try {
    const result = await deleteDocComment(id, type, commentId, currentUser);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, id: result.data.id }, { status: 200 });
  } catch (err) {
    console.error("[DELETE /api/docs/[type]/[id]/comments/[commentId]] deleteDocComment failed:", err);
    return NextResponse.json({ ok: false, error: "删除评论失败，请稍后重试。" }, { status: 500 });
  }
}
