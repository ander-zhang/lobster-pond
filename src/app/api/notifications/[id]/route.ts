import { NextResponse } from "next/server";
import { deleteNotification, markNotificationRead } from "@/lib/services/notification-service";
import { requireUser } from "@/lib/route-auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const user = await requireUser(request, "请先登录");
  if (user instanceof NextResponse) return user;

  const { id } = await context.params;
  const updated = await markNotificationRead(id, user.id);
  if (!updated) {
    return NextResponse.json({ ok: false, error: "消息不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await requireUser(request, "请先登录");
  if (user instanceof NextResponse) return user;

  const { id } = await context.params;
  const deleted = await deleteNotification(id, user.id);
  if (!deleted) {
    return NextResponse.json({ ok: false, error: "消息不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
