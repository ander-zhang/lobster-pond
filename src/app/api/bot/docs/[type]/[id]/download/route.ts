import { NextResponse } from "next/server";
import { getBots, getDoc } from "@/lib/content";
import { incrementDocDownload } from "@/lib/content-mutations";
import { resolveDocDownloadFile } from "@/lib/doc-download";
import { docVisibleTo, getVisibilityContext } from "@/lib/visibility";
import type { DocType } from "@/lib/types";
import { authenticateBotRequest } from "@/lib/services/bot-credential-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ type: string; id: string }> };

// 虾通过 MCP 工具 download_doc 下载已批准的知识 / 技能（动态路径版）。
// 与公开下载接口语义一致（有附件返回附件原文，无附件实时导出），
// 差异：强制仅 Approved 可下（正式依据规则），返回 JSON + contentBase64 供 MCP 接住。
// 兼容备选：静态路由 POST /api/bot/docs/download（type/docId 进 body），
// 用于 MCP hub 无法正确配置多段动态路径参数时的回退。
export async function GET(request: Request, context: RouteContext) {
  const auth = await authenticateBotRequest(request.headers.get("authorization"), request.headers.get("x-lobster-token"));
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { type, id } = await context.params;
  if (type !== "knowledge" && type !== "skills") {
    return NextResponse.json({ ok: false, error: "文档类型无效" }, { status: 422 });
  }

  const doc = await getDoc(type as DocType, id);
  if (!doc) {
    return NextResponse.json({ ok: false, error: `文档不存在：${type}/${id}` }, { status: 404 });
  }
  // 可见性守卫（虾视角 = 虾 owner 的视角）：不可见文档与「不存在」同构，不泄露存在性。
  // 置于下方 Approved 判定之前；互通模式 docVisibleTo 恒真，行为不变。
  const botsById = new Map((await getBots()).map((b) => [b.id, b] as const));
  if (!docVisibleTo(doc, botsById, await getVisibilityContext(), auth.principal.owner.id)) {
    return NextResponse.json({ ok: false, error: `文档不存在：${type}/${id}` }, { status: 404 });
  }
  // 正式依据规则：仅 Approved 可下（与公开下载接口一致，见 doc 下载语义）。
  const isApproved = doc.contentState === "Approved";
  if (!isApproved) {
    return NextResponse.json({ ok: false, error: "文档未批准，不能作为正式依据下载" }, { status: 422 });
  }

  const file = await resolveDocDownloadFile(doc);

  // 计数 +1（无数据库时空操作）。放在确认能产出文件后，避免 404/422 也计数。
  await incrementDocDownload(id);

  return NextResponse.json({
    ok: true,
    // 文件元信息（filename / contentType / sizeBytes）只在 doc 对象内，顶层不冗余（契约 2026-08-25 收敛）。
    doc: {
      id: doc.id,
      type: doc.type,
      title: doc.title,
      contentState: doc.contentState,
      filename: file.filename,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
    },
    contentBase64: file.contentBase64,
  });
}
