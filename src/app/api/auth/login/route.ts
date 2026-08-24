import { NextResponse } from "next/server";
import { loginUser } from "@/lib/services/auth-service";
import { buildSessionCookie } from "@/lib/services/session";
import { clientIp, rateLimit, getRateLimitConfig } from "@/lib/services/rate-limit";

export const dynamic = "force-dynamic";

// 登录：用户名 + 密码。凭据错误统一返回 401 模糊错误，不泄露账号是否存在。
// 按 IP 与用户名双重限流，降低暴力破解 / 撞库的在线攻击面。
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法的 JSON" }, { status: 400 });
  }

  const { loginMax, windowMs } = getRateLimitConfig();
  const ip = clientIp(request);
  const username =
    typeof body === "object" && body !== null && typeof (body as { username?: unknown }).username === "string"
      ? ((body as { username: string }).username).trim().toLowerCase()
      : "";
  for (const [key, max] of [
    [`login:ip:${ip}`, loginMax],
    [`login:user:${username || "unknown"}`, loginMax],
  ] as const) {
    const rl = await rateLimit(key, max, windowMs);
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: "尝试过于频繁，请稍后再试" },
        { status: 429, headers: { "retry-after": String(rl.retryAfter) } },
      );
    }
  }

  let result;
  try {
    result = await loginUser(body);
  } catch (err) {
    // loginUser 会查库/写库（建会话）；DB 抛错（连接失败等）此前会冒泡成无信息的 500。
    // 这里捕获并记录真实原因，向前端回通用文案。
    console.error("[POST /api/auth/login] loginUser failed:", err);
    return NextResponse.json(
      { ok: false, error: "登录失败，请稍后重试；若持续失败请查看服务端日志。" },
      { status: 500 },
    );
  }
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 401 });
  }

  const { user, sessionId, expiresAt } = result.data;
  const response = NextResponse.json({ ok: true, user }, { status: 200 });
  response.headers.set("set-cookie", buildSessionCookie(sessionId, expiresAt));
  return response;
}
