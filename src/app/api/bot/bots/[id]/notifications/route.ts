import { NextResponse } from "next/server";
import { authenticateBotRequest } from "@/lib/services/bot-credential-service";
import { listBotNotifications, markBotNotificationRead } from "@/lib/services/bot-notification-service";

type RouteContext = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext) {
  const auth = await authenticateBotRequest(request.headers.get("authorization"), request.headers.get("x-lobster-token"));
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { id } = await context.params;
  if (id !== auth.principal.bot.id) return NextResponse.json({ ok: false, error: "只能读取自己的虾提醒" }, { status: 403 });
  const unreadOnly = new URL(request.url).searchParams.get("unread") === "1";
  const data = await listBotNotifications(id, unreadOnly);
  return NextResponse.json({ ok: true, ...data });
}

// 直连模式用 PATCH 确认通知；网关模式用 POST /api/bot/bots/{id}/notifications/read（见子路由）。
export async function PATCH(request: Request, context: RouteContext) {
  const auth = await authenticateBotRequest(request.headers.get("authorization"), request.headers.get("x-lobster-token"));
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { id } = await context.params;
  if (id !== auth.principal.bot.id) return NextResponse.json({ ok: false, error: "只能确认自己的虾提醒" }, { status: 403 });
  let body: { notificationId?: unknown } = {};
  try { body = (await request.json()) as { notificationId?: unknown }; } catch { /* empty */ }
  if (typeof body.notificationId !== "string" || !body.notificationId) return NextResponse.json({ ok: false, error: "缺少 notificationId" }, { status: 400 });
  const updated = await markBotNotificationRead(id, body.notificationId);
  return NextResponse.json({ ok: updated }, { status: updated ? 200 : 404 });
}
