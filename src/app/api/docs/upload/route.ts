import { NextResponse } from "next/server";
import { MAX_ASSET_BYTES, uploadDocAsset } from "@/lib/services/asset-service";
import { createDoc } from "@/lib/services/doc-service";
import { requireUser } from "@/lib/route-auth";
import { isPostDomain } from "@/lib/domain-options";
import { isSkillScenario } from "@/lib/skill-scenarios";
import { parseKnowledgeUpload, parseSkillUpload } from "@/lib/doc-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 上传知识 .md / 技能 .zip 或 .tar.gz 创建文档。
// multipart/form-data：type=knowledge|skills，file=文件。
// 知识：解析 frontmatter → createDoc。
// 技能：解压读 SKILL.md frontmatter → createDoc，再把原 zip 存为附件（下载返回原包）。
export async function POST(request: Request) {
  const currentUser = await requireUser(request);
  if (currentUser instanceof NextResponse) return currentUser;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "请用 multipart/form-data 上传" }, { status: 400 });
  }

  const type = String(form.get("type") ?? "");
  if (type !== "knowledge" && type !== "skills") {
    return NextResponse.json({ ok: false, error: "type 必须是 knowledge 或 skills" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "缺少文件" }, { status: 400 });
  }

  try {
    if (type === "knowledge") {
      const raw = await file.text();
      const docInput = parseKnowledgeUpload(raw);
      // 用户从网页上传的知识立即批准，忽略文件 frontmatter 中的状态。
      // 与技能分支一致：前端弹窗选定的领域覆盖 frontmatter 里的 domain（以用户选择为准）。
      const formDomain = String(form.get("domain") ?? "").trim();
      // 仅当弹窗选定的是合法枚举成员时才覆盖；非法值忽略（解析器已对自定义域报错）。
      if (formDomain && isPostDomain(formDomain)) {
        docInput.domain = formDomain;
      }
      // 种别 / 类型：前端弹窗选择（表单优先），回退文件 frontmatter。
      const formCategory = String(form.get("category") ?? "").trim();
      if (formCategory) {
        docInput.category = formCategory;
      }
      const formSubtype = String(form.get("subtype") ?? "").trim();
      // 经验无类型：表单不传 subtype 时保持文件值（通常也为空）。
      docInput.subtype = formSubtype || docInput.subtype;
      docInput.contentState = "Approved";
      // Web 用户发布归属人本人：不信任 frontmatter ownerBotIds（与机器接口强制 [当前虾]
      // 对称），恒置空——避免重传导出的虾文档 ownerBotIds 被信任而混入虾 mine 列表。
      docInput.ownerBotIds = [];
      const result = await createDoc(docInput, currentUser, { contentState: "Approved" });
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
      }
      return NextResponse.json({ ok: true, doc: result.data }, { status: 201 });
    }

    // skills：先校验体积，避免文档已建后附件超限造成孤儿文档。
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > MAX_ASSET_BYTES) {
      return NextResponse.json(
        { ok: false, error: `文件超过大小上限（${Math.round(MAX_ASSET_BYTES / 1024 / 1024)}MB）` },
        { status: 422 },
      );
    }

    const { docInput, packageBase64 } = parseSkillUpload(bytes, file.name);
    // 用户从网页上传的技能立即批准，忽略 SKILL.md 中的状态。
    docInput.contentState = "Approved";
    // 若前端在弹窗中选定了场景，以此覆盖 SKILL.md frontmatter 里的 scenario（以用户选择为准）。
    const formScenario = String(form.get("scenario") ?? "").trim();
    if (formScenario && isSkillScenario(formScenario)) {
      docInput.scenario = formScenario;
    }
    // Web 用户发布归属人本人：不信任 SKILL.md frontmatter ownerBotIds（与知识分支、
    // 机器接口强制 [当前虾] 对称），恒置空，避免人发文档混入虾 mine 列表。
    docInput.ownerBotIds = [];
    const docResult = await createDoc(docInput, currentUser, { contentState: "Approved" });
    if (!docResult.ok) {
      return NextResponse.json({ ok: false, error: docResult.error }, { status: 422 });
    }

    // 文档已建；把原 zip 存为附件。附件失败则文档已成孤儿——向前端报错，便于人工处理。
    const assetResult = await uploadDocAsset({
      type: "skills",
      id: docInput.id,
      filename: file.name || `${docInput.id}.zip`,
      contentBase64: packageBase64,
    }, currentUser);
    if (!assetResult.ok) {
      console.error("[POST /api/docs/upload] skill asset upload failed:", assetResult.error);
      return NextResponse.json(
        { ok: false, error: `文档已创建但附件存储失败：${assetResult.error}（建议删除该文档后重试）` },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, doc: docResult.data }, { status: 201 });
  } catch (err) {
    // 解析/解压错误（缺字段、非 zip、无 SKILL.md 等）。
    const message = err instanceof Error ? err.message : "上传失败";
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
  }
}
