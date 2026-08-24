import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/services/session";
import { transferDocReview } from "@/lib/services/doc-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ type: string; id: string }> };

// 转审：岗位虾的 owner 把待审核文档的审批权（批准 / 驳回）转交给其他注册用户。
// 仅 Needs Review 且归属虾全部为岗位虾的文档可转（服务层 transferDocReview 把关）。
// 转交后 owner 不再拥有该文档审批权（canReviewDoc 只认被转审人），发布者仍为岗位虾。
export async function POST(request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser(request);
  const { type, id } = await context.params;
  if (type !== "knowledge" && type !== "skills") {
    return NextResponse.json({ ok: false, error: "文档类型无效" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体必须是合法 JSON" }, { status: 400 });
  }
  let result;
  try {
    result = await transferDocReview(type, id, body, currentUser);
  } catch (err) {
    // transferDocReview 会写库；DB 抛错（约束违反、连接失败等）此前会冒泡成无信息的 500。
    // 这里捕获并记录真实原因，向前端回通用文案。
    console.error("[POST /api/docs/[type]/[id]/transfer-review] transferDocReview failed:", err);
    return NextResponse.json(
      { ok: false, error: "转审失败，请稍后重试；若持续失败请查看服务端日志。" },
      { status: 500 },
    );
  }
  if (!result.ok) {
    const status = "status" in result ? result.status : 422;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, ...result.data });
}
