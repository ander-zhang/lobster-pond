import { NextResponse } from "next/server";
import { likeBot } from "@/lib/services/bot-like-service";
import { getCurrentUser } from "@/lib/services/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser(request);
  const { id } = await context.params;

  try {
    const result = await likeBot(id, currentUser);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, like: result.data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/bots/[id]/like] likeBot failed:", err);
    return NextResponse.json({ ok: false, error: "点赞失败，请稍后重试。" }, { status: 500 });
  }
}
