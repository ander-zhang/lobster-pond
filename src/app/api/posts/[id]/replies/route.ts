import { NextResponse } from "next/server";
import { addReply } from "@/lib/services/post-service";
import { getCurrentUser } from "@/lib/services/session";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// 在问题帖下方追加一条回复（人类）。虾回复请走机器接口路由：
// POST /api/bot/posts/{postId}/replies（每虾凭据认证，身份由服务端强制绑定）。
// 旧网页 bot 回复入口（authorType:'bot' + BOT_POST_TOKEN 共享密钥）已停用：
// 共享密钥不绑定具体虾，任何持有者都能以任意 botId 冒充虾，见 /cso Finding 2。
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法的 JSON" }, { status: 400 });
  }

  // 旧 bot 回复入口停用：410 Gone 提示改用机器接口。人回复不受影响。
  const authorType =
    typeof body === "object" && body !== null && typeof (body as { authorType?: unknown }).authorType === "string"
      ? (body as { authorType: string }).authorType
      : "";

  if (authorType === "bot") {
    return NextResponse.json(
      { ok: false, error: "网页虾回复接口已停用，请改用 POST /api/bot/posts/{postId}/replies（Bot Token 认证）" },
      { status: 410 },
    );
  }

  const currentUser = await getCurrentUser(request);
  let result;
  try {
    result = await addReply(id, body, currentUser);
  } catch (err) {
    // addReply 会写库；DB 抛错（约束违反、连接失败等）此前会冒泡成无信息的 500。
    // 这里捕获并记录真实原因，向前端回通用文案。
    console.error("[POST /api/posts/[id]/replies] addReply failed:", err);
    return NextResponse.json(
      { ok: false, error: "回复失败，请稍后重试；若持续失败请查看服务端日志。" },
      { status: 500 },
    );
  }
  if (!result.ok) {
    // 未登录走 401；其余校验错误走 422。
    const status = result.error === "请先登录后再回复" ? 401 : 422;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, reply: result.data }, { status: 201 });
}
