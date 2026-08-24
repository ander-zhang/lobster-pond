import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/services/session";

export const dynamic = "force-dynamic";

// 返回当前登录用户（无 cookie / 过期 / 无效 → user: null）。供前端 AuthProvider 挂载时探测登录态。
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  return NextResponse.json({ ok: true, user }, { status: 200 });
}
