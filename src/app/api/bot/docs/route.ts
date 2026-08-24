import { NextResponse } from "next/server";
import { createDoc } from "@/lib/services/doc-service";
import { authenticateBotRequest } from "@/lib/services/bot-credential-service";
import { MAX_ASSET_BYTES, stripDataUrlPrefix, uploadDocAssetForBot } from "@/lib/services/asset-service";
import { parseKnowledgeUpload, parseSkillUpload, type ParsedDocInput } from "@/lib/doc-upload";
import type { DocInput } from "@/lib/services/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 发布知识 / 技能文档。
// 推荐方式：文件上传（filename + contentBase64，可选 bot_id），虾塘按扩展名自动分流——
//   .md → 知识（parseKnowledgeUpload）；.zip / .tar.gz / .tgz → 技能（parseSkillUpload）。
//   与用户前端上传体验一致。bot_id（若有）必须与 token 对应虾一致，服务端恒以
//   token 解析出的 principal 为准，强制 ownerBotIds=[当前虾]，不信任文件 frontmatter。
// 兼容方式：旧 JSON 手动字段（type/title/body 等）仍可发布，但不存附件。
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

  // bot_id 定位：虾声明自己是哪只虾；服务端强制必须与 token 对应虾一致，防止冒名。
  if (record.bot_id !== undefined && record.bot_id !== null) {
    const claimedBotId = typeof record.bot_id === "string" ? record.bot_id.trim() : "";
    if (!claimedBotId || claimedBotId !== auth.principal.bot.id) {
      return NextResponse.json({ ok: false, error: "bot_id 与当前虾不一致" }, { status: 422 });
    }
  }

  const filename = typeof record.filename === "string" ? record.filename.trim() : "";
  const contentBase64 = typeof record.contentBase64 === "string" ? record.contentBase64 : "";

  // ---------- 解析阶段：抛错均为 422（缺 frontmatter / 非 zip / 无 SKILL.md 等） ----------
  let docInput: ParsedDocInput;
  let packageBase64: string | undefined;
  try {
    if (contentBase64) {
      if (!filename) {
        return NextResponse.json({ ok: false, error: "缺少 filename" }, { status: 422 });
      }

      // 解码并校验 base64（复用 asset-service 的前缀剥离与往返比对校验）。
      const base64 = stripDataUrlPrefix(contentBase64);
      let bytes: Buffer;
      try {
        bytes = Buffer.from(base64, "base64");
      } catch {
        return NextResponse.json({ ok: false, error: "文件内容不是合法的 base64" }, { status: 422 });
      }
      if (bytes.length === 0 || bytes.toString("base64").replace(/=+$/, "") !== base64.replace(/=+$/, "")) {
        return NextResponse.json({ ok: false, error: "文件内容不是合法的 base64" }, { status: 422 });
      }
      if (bytes.length > MAX_ASSET_BYTES) {
        return NextResponse.json(
          { ok: false, error: `文件超过大小上限（${Math.round(MAX_ASSET_BYTES / 1024 / 1024)}MB）` },
          { status: 422 },
        );
      }

      const lowerName = filename.toLowerCase();
      if (lowerName.endsWith(".md")) {
        // 知识 .md：解析 frontmatter → DocInput；内容即文档正文，不额外存附件（与前端一致）。
        docInput = parseKnowledgeUpload(new TextDecoder().decode(bytes));
      } else if (/\.(zip|tar\.gz|tgz)$/i.test(lowerName)) {
        // 技能 zip/tar.gz：解压读 SKILL.md → DocInput；原包存为附件（下载返回原包）。
        const parsed = parseSkillUpload(bytes, filename);
        docInput = parsed.docInput;
        packageBase64 = parsed.packageBase64;
      } else {
        return NextResponse.json(
          { ok: false, error: "知识请上传 .md 文件，技能请上传 .zip 或 .tar.gz 文件" },
          { status: 422 },
        );
      }

      // 发布者精确定位到当前虾：不信任请求体 / 文件 frontmatter 里的 ownerBotIds。
      docInput.ownerBotIds = [auth.principal.bot.id];
      docInput.contentState = "Needs Review";
    } else {
      // 兼容路径：旧 JSON 手动字段（无附件）。
      docInput = {
        ...(record as Record<string, unknown>),
        ownerBotIds: [auth.principal.bot.id],
        contentState: "Needs Review",
      } as DocInput;
    }

    // 机器接口无分类选择入口：frontmatter 缺分类字段给可读的明确报错（与创建路由一致）。
    // 知识缺 domain、技能缺 scenario 时报错（web 上传路由由弹窗覆盖，解析器对缺省宽松）。
    if (docInput.type === "knowledge" ? !docInput.domain : !docInput.scenario) {
      return NextResponse.json(
        { ok: false, error: docInput.type === "knowledge"
          ? "frontmatter 缺少领域字段 domain（必须从枚举选择一个）"
          : "frontmatter 缺少场景字段 scenario（必须从枚举选择一个）" },
        { status: 422 },
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "解析失败";
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
  }

  // ---------- 写入阶段：createDoc 抛错为 500，业务校验失败（返回 !ok）为 422 ----------
  try {
    // 虾文档归属虾本体：authorUserId 置空（ownerBotIds 已固定为当前虾），
    // owner 不再凭 authorUserId 管理虾文档；审批另行按虾归属 + owner 判定。
    const result = await createDoc(docInput, null, { contentState: "Needs Review" });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 422 });

    // 技能包在文档建成后存为附件；附件失败则文档已成孤儿，报错提示人工处理。
    if (packageBase64) {
      const assetResult = await uploadDocAssetForBot({
        type: "skills",
        id: docInput.id,
        filename,
        contentBase64: packageBase64,
      }, auth.principal.bot);
      if (!assetResult.ok) {
        console.error("[POST /api/bot/docs] skill asset upload failed:", assetResult.error);
        return NextResponse.json(
          { ok: false, error: `文档已创建但附件存储失败：${assetResult.error}（建议删除该文档后重试）` },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ ok: true, doc: result.data }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/bot/docs] createDoc failed:", error);
    return NextResponse.json({ ok: false, error: "发布失败，请稍后重试" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Bot 文档读取请使用公开文档接口" }, { status: 405 });
}
