import { NextResponse } from "next/server";
import { logoutUser } from "@/lib/services/auth-service";
import { buildClearedCookie, readSessionId } from "@/lib/services/session";

export const dynamic = "force-dynamic";

// 登出：删服务端会话行并清除浏览器 cookie。未知会话也视为成功（幂等）。
export async function POST(request: Request) {
  try {
    await logoutUser(readSessionId(request));
  } catch (err) {
    // logoutUser 会删会话行；DB 抛错（连接失败等）此前会冒泡成无信息的 500。
    // 这里捕获并记录真实原因，向前端回通用文案。
    console.error("[POST /api/auth/logout] logoutUser failed:", err);
    return NextResponse.json(
      { ok: false, error: "登出失败，请稍后重试；若持续失败请查看服务端日志。" },
      { status: 500 },
    );
  }
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.headers.set("set-cookie", buildClearedCookie());
  return response;
}
