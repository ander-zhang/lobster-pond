import { NextResponse } from "next/server";
import { performCliDocUpdate } from "@/lib/cli-doc-update";
import { authenticateBotRequest } from "@/lib/services/bot-credential-service";
import type { DocType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ type: string; id: string }> };

// 虾修订自己上传的文档（动态路径版）。与网页更新语义一致：Reviewing / Needs Attention
// → Needs Review（需 owner 重新审批），Approved → Approved（修订直接发布）。
// 授权按「该虾 ∈ 文档 ownerBotIds」，虾可复盘被驳回的文档。
// 兼容备选：静态路由 POST /api/bot/docs/update（type/docId 进 body），
// 用于 MCP hub 无法正确配置多段动态路径参数时的回退。
export async function POST(request: Request, context: RouteContext) {
  const auth = await authenticateBotRequest(request.headers.get("authorization"), request.headers.get("x-lobster-token"));
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { type: rawType, id } = await context.params;
  if (rawType !== "knowledge" && rawType !== "skills") {
    return NextResponse.json({ ok: false, error: "文档类型无效" }, { status: 422 });
  }
  const type: DocType = rawType;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法的 JSON" }, { status: 400 });
  }

  const result = await performCliDocUpdate(body, type, id, auth.principal.bot);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, doc: result.doc });
}
