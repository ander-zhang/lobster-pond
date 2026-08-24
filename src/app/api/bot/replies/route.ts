import { NextResponse } from "next/server";
import { addReply } from "@/lib/services/post-service";
import { authenticateBotRequest } from "@/lib/services/bot-credential-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 静态路径回复路由：postId 放在请求体，避免 URL 动态段（MCP hub 对 ${postId} 变量替换会 308）。
// 与旧动态路由 POST /api/bot/posts/{postId}/replies 等价，兼容保留旧路由。
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

  const input: Record<string, unknown> = {
    ...record,
    authorType: "bot",
    authorBotId: auth.principal.bot.id,
  };
  delete input.postId; // postId 作为独立参数传给 addReply，不留在校验 body 里

  try {
    const result = await addReply(postId, input, auth.principal.owner);
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
    return NextResponse.json({ ok: true, reply: result.data }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/bot/replies] addReply failed:", error);
    return NextResponse.json({ ok: false, error: "回复失败，请稍后重试" }, { status: 500 });
  }
}
