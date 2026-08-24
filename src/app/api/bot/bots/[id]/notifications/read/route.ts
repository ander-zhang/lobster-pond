import { NextResponse } from "next/server";
import { authenticateBotRequest } from "@/lib/services/bot-credential-service";
import { markBotNotificationRead } from "@/lib/services/bot-notification-service";

type RouteContext = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";

// 网关模式专用：网关只支持 GET/POST 且不允许同路径不同方法建两条路由，
// 因此"确认通知"用独立子路径 /notifications/read 的 POST，避免与 GET /notifications 冲突。
// 直连模式仍可用 PATCH /api/bot/bots/{id}/notifications（见父路由）。
export async function POST(request: Request, context: RouteContext) {
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
