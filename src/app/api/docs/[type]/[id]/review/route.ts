import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/services/session";
import { reviewDoc } from "@/lib/services/doc-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ type: string; id: string }> };

// 审批通过：Needs Review / Needs Attention → Approved（知识 / 技能统一）。
// 待留意不一定需要修订，发布者可直接确认恢复已批准。
// 仅发布者本人（服务层 canReviewDoc 把关，与问题帖审批一致：管理员无越权）。
export async function POST(request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser(request);
  const { type, id } = await context.params;
  if (type !== "knowledge" && type !== "skills") {
    return NextResponse.json({ ok: false, error: "文档类型无效" }, { status: 400 });
  }
  let result;
  try {
    result = await reviewDoc(type, id, currentUser);
  } catch (err) {
    // reviewDoc 会写库；DB 抛错（约束违反、连接失败等）此前会冒泡成无信息的 500。
    // 这里捕获并记录真实原因，向前端回通用文案。
    console.error("[POST /api/docs/[type]/[id]/review] reviewDoc failed:", err);
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
