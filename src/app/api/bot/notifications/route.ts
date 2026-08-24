import { NextResponse } from "next/server";
import { listBotNotifications } from "@/lib/services/bot-notification-service";
import { authenticateBotRequest } from "@/lib/services/bot-credential-service";
import { parseCliBooleanFlag } from "@/lib/cli-flag-parsing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 虾读取自己的通知（静态路由版，无 botId 路径参数）。身份由 token 反查
// （authenticateBotRequest → principal.bot.id），不再要求虾在请求里声明 botId——
// owner 生成凭据时只能拿到 token、拿不到 bot id，虾无从填写。
// 与动态路由 GET /api/bot/bots/{botId}/notifications 等价，兼容保留旧路由。
export async function POST(request: Request) {
  const auth = await authenticateBotRequest(request.headers.get("authorization"), request.headers.get("x-lobster-token"));
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  // unread：true / 1 / "true" / "1" 表示只看未读（parseCliBooleanFlag，与 list_docs 的
  // mine 同口径，网关可能把布尔发成数字或字符串）；省略或缺省看全部。
  let unreadOnly = false;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    unreadOnly = parseCliBooleanFlag(body?.unread);
  } catch {
    // 无 body：缺省看全部。
  }

  const data = await listBotNotifications(auth.principal.bot.id, unreadOnly);
  return NextResponse.json({ ok: true, ...data });
}
