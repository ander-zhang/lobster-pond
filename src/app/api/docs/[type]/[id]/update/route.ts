import { NextResponse } from "next/server";
import { parseKnowledgeUpload, parseSkillUpload } from "@/lib/doc-upload";
import { MAX_ASSET_BYTES } from "@/lib/services/asset-service";
import { updateDocFromUpload } from "@/lib/services/doc-service";
import { getCurrentUser } from "@/lib/services/session";
import type { DocAsset, DocType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ type: string; id: string }> };

// 以新上传的 .md / .zip / .tar.gz 覆盖文档内容。仅原发布者可更新；修订后状态按原状态分流：
// 待留意 / 复盘中 → 待审核（需人工复审），已批准 → 已批准（修订直接发布）。
export async function POST(request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser(request);
  const { type: rawType, id } = await context.params;
  if (rawType !== "knowledge" && rawType !== "skills") {
    return NextResponse.json({ ok: false, error: "type 必须是 knowledge 或 skills" }, { status: 400 });
  }
  const type: DocType = rawType;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "请用 multipart/form-data 上传" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "缺少文件" }, { status: 400 });
  }
  if (file.size > MAX_ASSET_BYTES) {
    return NextResponse.json(
      { ok: false, error: `文件超过大小上限（${Math.round(MAX_ASSET_BYTES / 1024 / 1024)}MB）` },
      { status: 422 },
    );
  }

  try {
    let docInput;
    let asset: Omit<DocAsset, "uploadedAt"> | null = null;
    if (type === "knowledge") {
      docInput = parseKnowledgeUpload(await file.text());
    } else {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = parseSkillUpload(bytes, file.name);
      docInput = parsed.docInput;
      asset = {
        docId: id,
        docType: type,
        filename: file.name || `${id}.zip`,
        contentType: parsed.contentType,
        contentBase64: parsed.packageBase64,
        sizeBytes: bytes.length,
      };
    }

    const result = await updateDocFromUpload(type, id, { docInput, asset }, currentUser);
    if (!result.ok) {
      const status = "status" in result ? result.status : 422;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }
    return NextResponse.json({ ok: true, doc: result.data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "更新失败";
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
  }
}
