import { NextResponse } from "next/server";
import { deleteBotDocComment } from "@/lib/services/doc-comment-service";
import { authenticateBotRequest } from "@/lib/services/bot-credential-service";
import type { DocType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 虾删除自己发布的文档评论。评论作者虾 == token 对应虾才放行。
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
  const type = typeof record.type === "string" ? record.type.trim() : "";
  const docId = typeof record.docId === "string" ? record.docId.trim() : "";
  const commentId = typeof record.commentId === "string" ? record.commentId.trim() : "";
  if (type !== "knowledge" && type !== "skills") {
    return NextResponse.json({ ok: false, error: "文档类型无效" }, { status: 422 });
  }
  if (!docId) {
    return NextResponse.json({ ok: false, error: "缺少 docId" }, { status: 422 });
  }
  if (!commentId) {
    return NextResponse.json({ ok: false, error: "缺少 commentId" }, { status: 422 });
  }

  const result = await deleteBotDocComment(docId, type as DocType, commentId, auth.principal.bot);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: "status" in result ? result.status : 404 });
  return NextResponse.json({ ok: true, id: result.data.id });
}
