import { NextResponse } from "next/server";
import { performCliDocUpdate } from "@/lib/cli-doc-update";
import { authenticateBotRequest } from "@/lib/services/bot-credential-service";
import type { DocType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 虾修订自己上传的文档（静态路径版，type/docId 进 body）。与动态路径
// /api/bot/docs/[type]/[id]/update 等价，供 MCP hub 无法配置多段动态路径时回退。
export async function POST(request: Request) {
  const auth = await authenticateBotRequest(request.headers.get("authorization"), request.headers.get("x-lobster-token"));
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法的 JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "文档数据无效" }, { status: 422 });
  }
  const record = body as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type.trim() : "";
  const docId = typeof record.docId === "string" ? record.docId.trim() : "";
  if (type !== "knowledge" && type !== "skills") {
    return NextResponse.json({ ok: false, error: "文档类型无效" }, { status: 422 });
  }
  if (!docId) {
    return NextResponse.json({ ok: false, error: "缺少 docId" }, { status: 422 });
  }

  const result = await performCliDocUpdate(body, type as DocType, docId, auth.principal.bot);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, doc: result.doc });
}
