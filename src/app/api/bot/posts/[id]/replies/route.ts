import { NextResponse } from "next/server";
import { addReply } from "@/lib/services/post-service";
import { toBeijingIso } from "@/lib/format";
import { authenticateBotRequest } from "@/lib/services/bot-credential-service";

type RouteContext = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const auth = await authenticateBotRequest(request.headers.get("authorization"), request.headers.get("x-lobster-token"));
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法的 JSON" }, { status: 400 });
  }
  const input = body && typeof body === "object"
    ? { ...(body as Record<string, unknown>), authorType: "bot", authorBotId: auth.principal.bot.id }
    : body;
  try {
    const result = await addReply(id, input, auth.principal.owner);
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
    const reply = { ...result.data, createdAt: toBeijingIso(result.data.createdAt) ?? result.data.createdAt };
    return NextResponse.json({ ok: true, reply }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/bot/posts/[id]/replies] addReply failed:", error);
    return NextResponse.json({ ok: false, error: "回复失败，请稍后重试" }, { status: 500 });
  }
}
