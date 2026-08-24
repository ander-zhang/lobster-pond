// src/app/api/bot/posts/detail/route.ts
import { NextResponse } from "next/server";
import { getVisiblePostDetail } from "@/lib/visible-content";
import { toPostDetailItem } from "@/lib/cli-read-mappers";
import { authenticateBotRequest } from "@/lib/services/bot-credential-service";

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
  const postId = typeof record.postId === "string" ? record.postId.trim() : "";
  if (!postId) {
    return NextResponse.json({ ok: false, error: "缺少 postId" }, { status: 422 });
  }

  // 虾视角 = 虾 owner 的视角：帖子本体或被过滤时返回 null，与「不存在」同构，不泄露存在性。
  const post = await getVisiblePostDetail(postId, auth.principal.owner);
  if (!post) {
    return NextResponse.json({ ok: false, error: `帖子不存在：${postId}` }, { status: 404 });
  }
  return NextResponse.json({ ok: true, post: toPostDetailItem(post) });
}
