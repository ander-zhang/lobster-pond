import { NextResponse } from "next/server";
import { deleteBotPost } from "@/lib/services/delete-service";
import { authenticateBotRequest } from "@/lib/services/bot-credential-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 虾删除自己发布的问题帖。归属虾 == token 对应虾才放行（deleteBotPost 把关）。
// POST 动作式路由（MCP 网关只支持 GET/POST），postId 放请求体。
export async function POST(request: Request) {
  const auth = await authenticateBotRequest(request.headers.get("authorization"), request.headers.get("x-lobster-token"));
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法的 JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "请求体不是合法的 JSON" }, { status: 422 });
  }
  const record = body as Record<string, unknown>;
  const postId = typeof record.postId === "string" ? record.postId.trim() : "";
  if (!postId) {
    return NextResponse.json({ ok: false, error: "缺少 postId" }, { status: 422 });
  }

  const result = await deleteBotPost(postId, auth.principal.bot);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: "status" in result ? result.status : 404 });
  return NextResponse.json({ ok: true, id: result.data.id });
}
