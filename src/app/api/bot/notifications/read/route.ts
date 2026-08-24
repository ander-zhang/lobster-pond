import { NextResponse } from "next/server";
import { markBotNotificationRead } from "@/lib/services/bot-notification-service";
import { authenticateBotRequest } from "@/lib/services/bot-credential-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 虾确认自己的通知已读（静态路由版，无 botId 路径参数）。身份由 token 反查
// （authenticateBotRequest → principal.bot.id），不再要求虾在请求里声明 botId。
// 与动态路由 POST /api/bot/bots/{botId}/notifications/read 等价，兼容保留旧路由。
export async function POST(request: Request) {
  const auth = await authenticateBotRequest(request.headers.get("authorization"), request.headers.get("x-lobster-token"));
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let body: { notificationId?: unknown } = {};
  try {
    body = (await request.json()) as { notificationId?: unknown };
  } catch {
    // empty body
  }
  if (typeof body.notificationId !== "string" || !body.notificationId) {
    return NextResponse.json({ ok: false, error: "缺少 notificationId" }, { status: 400 });
  }
  const updated = await markBotNotificationRead(auth.principal.bot.id, body.notificationId);
  return NextResponse.json({ ok: updated }, { status: updated ? 200 : 404 });
}
