// 机器接口文档更新请求的文件解析：把虾上传的 .md / .zip / .tar.gz 还原成
// 修订所需的 docInput + 附件，与创建路由（POST /api/bot/docs）同款分流逻辑。
// 抛错均为业务校验失败，调用方转 422。
import { MAX_ASSET_BYTES, stripDataUrlPrefix } from "./services/asset-service";
import { parseKnowledgeUpload, parseSkillUpload, type ParsedDocInput } from "./doc-upload";
import type { DocAsset, DocType } from "./types";

export type CliDocUpdateParseResult = {
  docInput: ParsedDocInput;
  filename: string;
  // 技能 zip / tar.gz 原包存为附件（下载时返回原包）；知识 .md 无附件。
  asset: Omit<DocAsset, "uploadedAt"> | null;
};

export function parseCliDocUpdate(
  record: Record<string, unknown>,
  pathType: DocType,
): CliDocUpdateParseResult {
  const filename = typeof record.filename === "string" ? record.filename.trim() : "";
  const contentBase64 = typeof record.contentBase64 === "string" ? record.contentBase64 : "";
  if (!contentBase64) {
    throw new Error("缺少 contentBase64（文件内容需 base64 编码）");
  }
  if (!filename) {
    throw new Error("缺少 filename");
  }

  // 解码并校验 base64（复用 asset-service 的前缀剥离与往返比对校验）。
  const base64 = stripDataUrlPrefix(contentBase64);
  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, "base64");
  } catch {
    throw new Error("文件内容不是合法的 base64");
  }
  if (bytes.length === 0 || bytes.toString("base64").replace(/=+$/, "") !== base64.replace(/=+$/, "")) {
    throw new Error("文件内容不是合法的 base64");
  }
  if (bytes.length > MAX_ASSET_BYTES) {
    throw new Error(`文件超过大小上限（${Math.round(MAX_ASSET_BYTES / 1024 / 1024)}MB）`);
  }

  const lowerName = filename.toLowerCase();
  let docInput: ParsedDocInput;
  let asset: Omit<DocAsset, "uploadedAt"> | null = null;
  if (lowerName.endsWith(".md")) {
    docInput = parseKnowledgeUpload(new TextDecoder().decode(bytes));
  } else if (/\.(zip|tar\.gz|tgz)$/i.test(lowerName)) {
    const parsed = parseSkillUpload(bytes, filename);
    docInput = parsed.docInput;
    asset = {
      docId: "", // 目标文档 id 由调用方填充（更新时主键可能变更）。
      docType: "skills",
      filename,
      contentType: parsed.contentType,
      contentBase64: parsed.packageBase64,
      sizeBytes: bytes.length,
    };
  } else {
    throw new Error("知识请上传 .md 文件，技能请上传 .zip 或 .tar.gz 文件");
  }
  if (docInput.type !== pathType) {
    throw new Error(`上传文件类型（${docInput.type}）与文档类型（${pathType}）不一致`);
  }
  return { docInput, filename, asset };
}
