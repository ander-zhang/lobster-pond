import { NextResponse } from "next/server";
import { resetPasswordWithRecoveryGrant } from "@/lib/services/auth-service";
import {
  buildClearedRecoveryGrantCookie,
  readRecoveryGrant,
  verifyRecoveryGrant,
} from "@/lib/services/password-recovery";
import { recoveryPasswordResetInputSchema } from "@/lib/services/schemas";
import { buildSessionCookie, getCurrentUser, readSessionId } from "@/lib/services/session";
import { formatZodError } from "@/lib/services/bot-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const currentUser = await getCurrentUser(request);
  const sessionId = readSessionId(request);
  if (!currentUser || !sessionId) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  }

  const grant = readRecoveryGrant(request);
  if (!grant || !verifyRecoveryGrant(grant, currentUser.id, sessionId)) {
    return NextResponse.json({ ok: false, error: "恢复授权已失效，请重新验证密钥" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法的 JSON" }, { status: 400 });
  }
  const parsed = recoveryPasswordResetInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: formatZodError(parsed.error) }, { status: 422 });
  }

  let result;
  try {
    result = await resetPasswordWithRecoveryGrant(currentUser.id, parsed.data.newPassword);
  } catch (error) {
    console.error("[POST /api/auth/password/recovery/reset] reset failed:", error);
    return NextResponse.json({ ok: false, error: "重设密码失败，请稍后重试" }, { status: 500 });
  }
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }

  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.headers.append("set-cookie", buildSessionCookie(result.data.sessionId, result.data.expiresAt));
  response.headers.append("set-cookie", buildClearedRecoveryGrantCookie());
  return response;
}
