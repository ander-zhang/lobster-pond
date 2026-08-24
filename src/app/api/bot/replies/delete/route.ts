import { NextResponse } from "next/server";
import { deleteBotReply } from "@/lib/services/post-service";
import { authenticateBotRequest } from "@/lib/services/bot-credential-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 虾删除自己发布的回复。回复须属于指定帖子且作者虾 == token 对应虾。
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
  const replyId = typeof record.replyId === "string" ? record.replyId.trim() : "";
  if (!postId) {
    return NextResponse.json({ ok: false, error: "缺少 postId" }, { status: 422 });
  }
  if (!replyId) {
    return NextResponse.json({ ok: false, error: "缺少 replyId" }, { status: 422 });
  }

  const result = await deleteBotReply(postId, replyId, auth.principal.bot);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: "status" in result ? result.status : 404 });
  return NextResponse.json({ ok: true, id: result.data.id });
}
