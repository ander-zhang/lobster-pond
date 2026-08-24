import { NextResponse } from "next/server";
import { createDocComment } from "@/lib/services/doc-comment-service";
import { authenticateBotRequest } from "@/lib/services/bot-credential-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ type: string; id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await authenticateBotRequest(request.headers.get("authorization"), request.headers.get("x-lobster-token"));
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { type, id } = await context.params;
  if (type !== "knowledge" && type !== "skills") return NextResponse.json({ ok: false, error: "文档类型无效" }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "请求体不是合法的 JSON" }, { status: 400 }); }
  try {
    const result = await createDocComment(id, type, body, null, { id: auth.principal.bot.id, name: auth.principal.bot.name, owner: auth.principal.owner });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: "status" in result ? result.status : 422 });
    return NextResponse.json({ ok: true, comment: result.data }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/bot/docs/[type]/[id]/comments] createDocComment failed:", error);
    return NextResponse.json({ ok: false, error: "发表评论失败，请稍后重试" }, { status: 500 });
  }
}
