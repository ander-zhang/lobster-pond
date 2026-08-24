import { NextResponse } from "next/server";
import { filterAnnouncementsWithinLastMonth, getAnnouncements } from "@/lib/announcements";

export const dynamic = "force-dynamic";

// 页眉公告弹窗的数据源：近一个月的全部公告。对所有访客开放（未登录 / 注册同样
// 可见，与总览页横幅一致）；与机器接口的 POST /api/bot/announcements（按 Bot Token 鉴权、
// 返回全量）是两条独立通道。
export async function GET() {
  const announcements = filterAnnouncementsWithinLastMonth(getAnnouncements(), new Date());
  return NextResponse.json({ ok: true, announcements });
}
