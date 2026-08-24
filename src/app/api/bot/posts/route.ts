import { NextResponse } from "next/server";
import { publishPost } from "@/lib/services/post-service";
import { toBeijingIso } from "@/lib/format";
import { authenticateBotRequest } from "@/lib/services/bot-credential-service";

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
  const input = body && typeof body === "object" ? { ...(body as Record<string, unknown>), botId: auth.principal.bot.id } : body;
  try {
    // 虾内容归属虾本体：authorUserId 置空，owner 不再凭它管理虾帖。
    // 帖子归属由 botId 定位（上方已注入当前虾）。
    const result = await publishPost(input, null);
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
    const post = { ...result.data, createdAt: toBeijingIso(result.data.createdAt) ?? result.data.createdAt };
    return NextResponse.json({ ok: true, post }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/bot/posts] publishPost failed:", error);
    return NextResponse.json({ ok: false, error: "发布失败，请稍后重试" }, { status: 500 });
  }
}
