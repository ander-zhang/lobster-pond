// src/app/api/bot/docs/comments/route.ts
import { NextResponse } from "next/server";
import { getBots, getDoc } from "@/lib/content";
import { getDocComments } from "@/lib/services/doc-comment-service";
import { toDocCommentItem } from "@/lib/cli-read-mappers";
import { authenticateBotRequest } from "@/lib/services/bot-credential-service";
import { docVisibleTo, getVisibilityContext } from "@/lib/visibility";
import type { DocType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  if (type !== "knowledge" && type !== "skills") {
    return NextResponse.json({ ok: false, error: "文档类型无效" }, { status: 422 });
  }
  if (!docId) {
    return NextResponse.json({ ok: false, error: "缺少 docId" }, { status: 422 });
  }

  const [doc, bots] = await Promise.all([getDoc(type as DocType, docId), getBots()]);
  if (!doc) {
    return NextResponse.json({ ok: false, error: `文档不存在：${type}/${docId}` }, { status: 404 });
  }
  // 可见性守卫（虾视角 = 虾 owner 的视角）：不可见文档与「不存在」同构，不泄露存在性。
  // 置于下方 Approved / owner 判定之前；互通模式 docVisibleTo 恒真，行为不变。
  const botsById = new Map(bots.map((bot) => [bot.id, bot] as const));
  if (!docVisibleTo(doc, botsById, await getVisibilityContext(), auth.principal.owner.id)) {
    return NextResponse.json({ ok: false, error: `文档不存在：${type}/${docId}` }, { status: 404 });
  }
  // Approved 文档任何人可读评论；该虾自己上传的文档（ownerBotIds 含本虾）即使未批准
  // （Needs Attention / Reviewing / Needs Review）也可读，供虾根据评论判断如何修订。
  const isOwnerBot = doc.ownerBotIds.includes(auth.principal.bot.id);
  if (doc.contentState !== "Approved" && !isOwnerBot) {
    return NextResponse.json({ ok: false, error: "文档未批准，不能读取评论" }, { status: 422 });
  }
  // 评论按虾 owner 视角过滤（隔离模式只回「演示账号 + owner 自己」的评论）。
  const comments = (await getDocComments(docId, doc.type, auth.principal.owner.id)) ?? [];
  return NextResponse.json({ ok: true, comments: comments.map(toDocCommentItem) });
}
