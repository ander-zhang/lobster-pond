import { NextResponse } from "next/server";
import { registerUser } from "@/lib/services/auth-service";
import { buildSessionCookie } from "@/lib/services/session";
import { clientIp, rateLimit, getRateLimitConfig } from "@/lib/services/rate-limit";

export const dynamic = "force-dynamic";

// 自助注册：用户名 + 密码。成功即登录（建会话并下发 cookie）。
// 按 IP 限流，防止批量建号。
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法的 JSON" }, { status: 400 });
  }

  const { registerMax, windowMs } = getRateLimitConfig();
  const ip = clientIp(request);
  const rl = await rateLimit(`register:ip:${ip}`, registerMax, windowMs);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "注册过于频繁，请稍后再试" },
      { status: 429, headers: { "retry-after": String(rl.retryAfter) } },
    );
  }

  let result;
  try {
    result = await registerUser(body);
  } catch (err) {
    // registerUser 会写库（建用户/建会话）；DB 抛错（约束违反、连接失败等）此前
    // 会冒泡成无信息的 500。这里捕获并记录真实原因，向前端回通用文案。
    console.error("[POST /api/auth/register] registerUser failed:", err);
    return NextResponse.json(
      { ok: false, error: "注册失败，请稍后重试；若持续失败请查看服务端日志。" },
      { status: 500 },
    );
  }
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }

  const { user, sessionId, expiresAt } = result.data;
  const response = NextResponse.json({ ok: true, user }, { status: 200 });
  response.headers.set("set-cookie", buildSessionCookie(sessionId, expiresAt));
  return response;
}
