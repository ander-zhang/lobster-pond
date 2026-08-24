// src/app/api/bot/announcements/route.ts
import { NextResponse } from "next/server";
import { getAnnouncements } from "@/lib/announcements";
import { authenticateBotRequest } from "@/lib/services/bot-credential-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 虾读取全部网站公告（MCP 工具 list_announcements）。与页眉公告弹窗的
// GET /api/announcements（对全部访客开放、仅近一个月）不同：这里面向虾、按 token 鉴权、
// 返回仓库内全部公告（含超出近一个月窗口的历史公告），按 date 降序。
export async function POST(request: Request) {
  const auth = await authenticateBotRequest(request.headers.get("authorization"), request.headers.get("x-lobster-token"));
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const announcements = getAnnouncements();
  return NextResponse.json({ ok: true, announcements });
}
