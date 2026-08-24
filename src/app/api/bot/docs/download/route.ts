import { NextResponse } from "next/server";
import { getBots, getDoc } from "@/lib/content";
import { incrementDocDownload } from "@/lib/content-mutations";
import { resolveDocDownloadFile } from "@/lib/doc-download";
import { docVisibleTo, getVisibilityContext } from "@/lib/visibility";
import type { DocType } from "@/lib/types";
import { authenticateBotRequest } from "@/lib/services/bot-credential-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 静态路径下载路由：type/docId 放在请求体，避免 URL 动态段
// （MCP hub 对多段动态路径 ${type}/${docId} 的替换/转发脆弱，会造成 404/308）。
// 与动态 GET /api/bot/docs/{type}/{id}/download 等价，兼容保留旧路由。
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
    return NextResponse.json({ ok: false, error: "请求体不是合法的 JSON" }, { status: 422 });
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

  const doc = await getDoc(type as DocType, docId);
  if (!doc) {
    return NextResponse.json({ ok: false, error: `文档不存在：${type}/${docId}` }, { status: 404 });
  }
  // 可见性守卫（虾视角 = 虾 owner 的视角）：不可见文档与「不存在」同构，不泄露存在性。
  // 置于下方 Approved 判定之前；互通模式 docVisibleTo 恒真，行为不变。
  const botsById = new Map((await getBots()).map((b) => [b.id, b] as const));
  if (!docVisibleTo(doc, botsById, await getVisibilityContext(), auth.principal.owner.id)) {
    return NextResponse.json({ ok: false, error: `文档不存在：${type}/${docId}` }, { status: 404 });
  }
  // 正式依据规则：仅 Approved 可下（与公开下载接口一致，见 doc 下载语义）。
  if (doc.contentState !== "Approved") {
    return NextResponse.json({ ok: false, error: "文档未批准，不能作为正式依据下载" }, { status: 422 });
  }

  try {
    const file = await resolveDocDownloadFile(doc);
    // 计数 +1（无数据库时空操作）。放在确认能产出文件后，避免 404/422 也计数。
    await incrementDocDownload(docId);
    return NextResponse.json({
      ok: true,
      doc: {
        id: doc.id,
        type: doc.type,
        title: doc.title,
        contentState: doc.contentState,
        filename: file.filename,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
      },
      filename: file.filename,
      contentType: file.contentType,
      contentBase64: file.contentBase64,
    });
  } catch (error) {
    console.error("[POST /api/bot/docs/download] resolve download file failed:", error);
    return NextResponse.json({ ok: false, error: "下载失败，请稍后重试" }, { status: 500 });
  }
}
