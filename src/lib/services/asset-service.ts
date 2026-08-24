import { getDoc } from "../content.ts";
import { upsertDocAsset, deleteDocAssetRow } from "../content-mutations.ts";
import { hasDatabase } from "../db.ts";
import { canUpdateDoc } from "./doc-service.ts";
import type { Bot } from "../types";
import type { ServiceResult } from "./bot-service.ts";
import type { SessionUser } from "./session.ts";
import type { DocAsset, DocAssetMeta, DocType } from "../types";

// 单个附件大小上限：5MB（按解码后的字节数计）。
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;

type UploadInput = {
  type: unknown;
  id: unknown;
  filename: unknown;
  contentBase64: unknown;
};

type ParsedUpload =
  | { ok: true; type: DocType; id: string; filename: string; contentBase64: string }
  | { ok: false; error: string };

// 纯校验：type / id / filename / contentBase64 存在性 + 扩展名分流。不含鉴权。
function parseUploadInput(input: UploadInput): ParsedUpload {
  const type = input.type;
  if (type !== "knowledge" && type !== "skills") {
    return { ok: false, error: "type 必须是 knowledge 或 skills" };
  }
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!id) return { ok: false, error: "缺少文档 id" };
  const filename = typeof input.filename === "string" ? input.filename.trim() : "";
  if (!filename) return { ok: false, error: "缺少文件名" };
  const contentBase64 = typeof input.contentBase64 === "string" ? input.contentBase64 : "";
  if (!contentBase64) return { ok: false, error: "缺少文件内容" };

  if (type === "knowledge" && !filename.toLowerCase().endsWith(".md")) {
    return { ok: false, error: "知识附件必须是 .md 文件" };
  }
  if (type === "skills" && !/\.(zip|tar\.gz|tgz)$/i.test(filename)) {
    return { ok: false, error: "技能附件必须是 .zip 或 .tar.gz 文件" };
  }
  return { ok: true, type, id, filename, contentBase64 };
}

// 解码校验 + upsert 附件。调用方（uploadDocAsset / uploadDocAssetForBot）负责鉴权。
async function saveDocAsset(
  parsed: Extract<ParsedUpload, { ok: true }>,
): Promise<ServiceResult<DocAssetMeta> | { ok: false; status: number; error: string }> {
  const { type, id, filename, contentBase64 } = parsed;
  const base64 = stripDataUrlPrefix(contentBase64);
  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, "base64");
  } catch {
    return { ok: false, error: "文件内容不是合法的 base64" };
  }
  if (bytes.length === 0 || bytes.toString("base64").replace(/=+$/, "") !== base64.replace(/=+$/, "")) {
    return { ok: false, error: "文件内容不是合法的 base64" };
  }
  if (bytes.length > MAX_ASSET_BYTES) {
    return { ok: false, error: `文件超过大小上限（${Math.round(MAX_ASSET_BYTES / 1024 / 1024)}MB）` };
  }
  // 技能支持 zip 与 gzip 压缩的 tar；zip 以 PK 开头，gzip 以 1F 8B 开头。
  if (type === "skills" && !((bytes[0] === 0x50 && bytes[1] === 0x4b) || (bytes[0] === 0x1f && bytes[1] === 0x8b))) {
    return { ok: false, error: "技能附件不是有效的 zip 或 tar.gz 文件" };
  }

  const contentType = type === "knowledge"
    ? "text/markdown; charset=utf-8"
    : filename.toLowerCase().endsWith(".zip") ? "application/zip" : "application/gzip";
  const asset: Omit<DocAsset, "uploadedAt"> = {
    docId: id,
    docType: type,
    filename,
    contentType,
    contentBase64: base64,
    sizeBytes: bytes.length,
  };

  await upsertDocAsset(asset);
  return {
    ok: true,
    data: {
      docId: asset.docId,
      docType: asset.docType,
      filename: asset.filename,
      contentType: asset.contentType,
      sizeBytes: asset.sizeBytes,
      uploadedAt: new Date().toISOString(),
    },
  };
}

// 网页侧上传/覆盖文档附件：仅发布者本人（canUpdateDoc 按 authorUserId 判定）。
// 虾文档 authorUserId 置空后，owner 对虾文档自然 403。
export async function uploadDocAsset(
  input: UploadInput,
  currentUser: SessionUser | null = null,
): Promise<ServiceResult<DocAssetMeta> | { ok: false; status: number; error: string }> {
  if (!hasDatabase()) {
    return { ok: false, error: "附件功能需要数据库（未配置 DATABASE_URL）" };
  }
  const parsed = parseUploadInput(input);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  const doc = await getDoc(parsed.type, parsed.id);
  if (!doc) {
    return { ok: false, error: `文档不存在：${parsed.type}/${parsed.id}` };
  }
  const decision = canUpdateDoc(currentUser, doc.authorUserId);
  if (!decision.allowed) {
    return { ok: false, status: decision.status, error: decision.error };
  }
  return saveDocAsset(parsed);
}

// 虾经机器接口更新自己上传的文档附件：归属虾 ∈ doc.ownerBotIds 才放行。
// 与 uploadDocAsset 共享解析/存储，仅鉴权依据不同（虾归属而非 authorUserId）。
export async function uploadDocAssetForBot(
  input: UploadInput,
  bot: Bot,
): Promise<ServiceResult<DocAssetMeta> | { ok: false; status: number; error: string }> {
  if (!hasDatabase()) {
    return { ok: false, error: "附件功能需要数据库（未配置 DATABASE_URL）" };
  }
  const parsed = parseUploadInput(input);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  const doc = await getDoc(parsed.type, parsed.id);
  if (!doc) {
    return { ok: false, error: `文档不存在：${parsed.type}/${parsed.id}` };
  }
  if (!doc.ownerBotIds.includes(bot.id)) {
    return { ok: false, status: 403, error: "只能为该虾上传的文档更新附件" };
  }
  return saveDocAsset(parsed);
}

export async function removeDocAsset(
  type: unknown,
  id: unknown,
  currentUser: SessionUser | null = null,
): Promise<ServiceResult<{ id: string }> | { ok: false; status: number; error: string }> {
  if (!hasDatabase()) {
    return { ok: false, error: "附件功能需要数据库（未配置 DATABASE_URL）" };
  }
  if (type !== "knowledge" && type !== "skills") {
    return { ok: false, error: "type 必须是 knowledge 或 skills" };
  }
  const docId = typeof id === "string" ? id.trim() : "";
  if (!docId) {
    return { ok: false, error: "缺少文档 id" };
  }
  const doc = await getDoc(type, docId);
  if (!doc) {
    return { ok: false, error: `文档不存在：${type}/${docId}` };
  }
  const decision = canUpdateDoc(currentUser, doc.authorUserId);
  if (!decision.allowed) {
    return { ok: false, status: decision.status, error: decision.error };
  }
  const removed = await deleteDocAssetRow(docId, type);
  if (!removed) {
    return { ok: false, error: `没有找到附件：${docId}` };
  }
  return { ok: true, data: { id: docId } };
}

// 去掉 data:URL 前缀（形如 "data:application/zip;base64,...."），返回纯 base64。
// 机器接口上传路由在解码前用它规整输入，与 uploadDocAsset 内部的校验保持一致。
export function stripDataUrlPrefix(value: string): string {
  const match = value.match(/^data:[^;]*;base64,([\s\S]*)$/);
  return (match ? match[1] : value).trim();
}
