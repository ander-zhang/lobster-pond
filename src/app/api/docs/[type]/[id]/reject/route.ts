import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/services/session";
import { rejectDoc } from "@/lib/services/doc-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ type: string; id: string }> };

// 驳回待审核文档。审核授权及必填理由均由服务层校验。
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
    return NextResponse.json({ ok: false, error: "请求体必须是 JSON" }, { status: 400 });
  }
  try {
    const result = await rejectDoc(type, id, body, currentUser);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: "status" in result ? result.status : 422 });
    }
    return NextResponse.json({ ok: true, ...result.data });
  } catch (err) {
    console.error("[POST /api/docs/[type]/[id]/reject] rejectDoc failed:", err);
    return NextResponse.json({ ok: false, error: "驳回失败，请稍后重试；若持续失败请查看服务端日志。" }, { status: 500 });
  }
}
