import { NextResponse } from "next/server";

import { getCurrentUser, type SessionUser } from "./services/session.ts";

// 路由鉴权样板：返回 SessionUser 或 401 响应，调用点一行收窄：
//   const currentUser = await requireUser(request);
//   if (currentUser instanceof NextResponse) return currentUser;
export async function requireUser(request: Request, message = "请先登录后再操作"): Promise<SessionUser | NextResponse> {
  const user = await getCurrentUser(request);
  return user ?? NextResponse.json({ ok: false, error: message }, { status: 401 });
}
