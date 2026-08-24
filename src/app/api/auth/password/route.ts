import { NextResponse } from "next/server";
import { buildSessionCookie } from "@/lib/services/session";
import { requireUser } from "@/lib/route-auth";
import { changePassword } from "@/lib/services/auth-service";

export const dynamic = "force-dynamic";

// 修改当前登录用户密码。body: { currentPassword, newPassword }。
// 成功后服务层会轮换会话（作废所有旧 session 并建新 session），这里下发新 cookie。
export async function POST(request: Request) {
  const currentUser = await requireUser(request, "请先登录");
  if (currentUser instanceof NextResponse) return currentUser;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法的 JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ ok: false, error: "请求体不是合法的 JSON" }, { status: 400 });
  }

  const { currentPassword, newPassword } = body as { currentPassword?: string; newPassword?: string };
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    return NextResponse.json({ ok: false, error: "缺少 currentPassword / newPassword" }, { status: 400 });
  }

  let result;
  try {
    result = await changePassword(currentUser.id, currentPassword, newPassword);
  } catch (err) {
    // changePassword 会写库（改密码 + 轮换会话）；DB 抛错（连接失败等）此前会
    // 冒泡成无信息的 500。这里捕获并记录真实原因，向前端回通用文案。
    console.error("[POST /api/auth/password] changePassword failed:", err);
    return NextResponse.json(
      { ok: false, error: "修改密码失败，请稍后重试；若持续失败请查看服务端日志。" },
      { status: 500 },
    );
  }
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.headers.set("set-cookie", buildSessionCookie(result.data.sessionId, result.data.expiresAt));
  return response;
}
