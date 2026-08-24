import { NextResponse } from "next/server";
import { buildSessionCookie } from "@/lib/services/session";
import { requireUser } from "@/lib/route-auth";
import { changeUsername } from "@/lib/services/auth-service";

export const dynamic = "force-dynamic";

// 修改当前登录用户名。body: { newUsername }。
// 成功后服务层轮换会话（作废旧 session 建新 session），这里下发新 cookie。
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

  const { newUsername } = body as { newUsername?: string };
  if (typeof newUsername !== "string") {
    return NextResponse.json({ ok: false, error: "缺少 newUsername" }, { status: 400 });
  }

  let result;
  try {
    result = await changeUsername(currentUser.id, newUsername);
  } catch (err) {
    // changeUsername 会写库（改用户名 + 同步历史展示名 + 轮换会话）；DB 抛错
    // （约束违反、连接失败等）此前会冒泡成无信息的 500。这里捕获并记录真实原因，
    // 向前端回通用文案。
    console.error("[POST /api/auth/username] changeUsername failed:", err);
    return NextResponse.json(
      { ok: false, error: "修改用户名失败，请稍后重试；若持续失败请查看服务端日志。" },
      { status: 500 },
    );
  }
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }
  const response = NextResponse.json({ ok: true, username: newUsername }, { status: 200 });
  response.headers.set("set-cookie", buildSessionCookie(result.data.sessionId, result.data.expiresAt));
  return response;
}
