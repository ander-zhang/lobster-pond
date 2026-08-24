import { NextResponse } from "next/server";
import { getNotifications, markAllNotificationsRead } from "@/lib/services/notification-service";
import { requireUser } from "@/lib/route-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await requireUser(request, "请先登录");
  if (user instanceof NextResponse) return user;

  const result = await getNotifications(user.id);
  return NextResponse.json({ ok: true, ...result });
}

export async function PATCH(request: Request) {
  const user = await requireUser(request, "请先登录");
  if (user instanceof NextResponse) return user;

  await markAllNotificationsRead(user.id);
  return NextResponse.json({ ok: true });
}
