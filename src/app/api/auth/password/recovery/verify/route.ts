import { NextResponse } from "next/server";
import { getCurrentUser, readSessionId } from "@/lib/services/session";
import { recoveryKeyInputSchema } from "@/lib/services/schemas";
import { clientIp, getRateLimitConfig, rateLimit } from "@/lib/services/rate-limit";
import { buildRecoveryGrantCookie, createRecoveryGrant, verifyRecoveryKey } from "@/lib/services/password-recovery";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const currentUser = await getCurrentUser(request);
  const sessionId = readSessionId(request);
  if (!currentUser || !sessionId) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法的 JSON" }, { status: 400 });
  }

  const { recoveryMax, recoveryWindowMs } = getRateLimitConfig();
  for (const key of [`password-recovery:ip:${clientIp(request)}`, `password-recovery:user:${currentUser.id}`]) {
    const limited = await rateLimit(key, recoveryMax, recoveryWindowMs);
    if (!limited.ok) {
      return NextResponse.json(
        { ok: false, error: "尝试过于频繁，请稍后再试" },
        { status: 429, headers: { "retry-after": String(limited.retryAfter) } },
      );
    }
  }

  const parsed = recoveryKeyInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "恢复验证失败，请检查密钥后重试" }, { status: 401 });
  }

  const verification = verifyRecoveryKey(parsed.data.recoveryKey);
  if (verification === "unconfigured") {
    return NextResponse.json({ ok: false, error: "密码恢复功能尚未配置" }, { status: 503 });
  }
  if (verification !== "valid") {
    return NextResponse.json({ ok: false, error: "恢复验证失败，请检查密钥后重试" }, { status: 401 });
  }

  const grant = createRecoveryGrant(currentUser.id, sessionId);
  if (!grant) {
    return NextResponse.json({ ok: false, error: "密码恢复功能尚未配置" }, { status: 503 });
  }
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.headers.set("set-cookie", buildRecoveryGrantCookie(grant));
  return response;
}
