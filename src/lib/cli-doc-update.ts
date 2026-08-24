// 虾通过机器接口修订自己上传的文档。动态路径（/api/bot/docs/[type]/[id]/update）
// 与静态路径（/api/bot/docs/update，type/docId 放 body）共用此 handler，避免两处
// 路由漂移。鉴权在路由层完成（拿到 principal.bot），这里只做解析与业务执行。
import { parseCliDocUpdate } from "./cli-doc-parse";
import { updateDocFromBotUpload } from "./services/doc-service";
import type { Bot, DocType, MarkdownDoc } from "./types";

export type CliDocUpdateOutcome =
  | { ok: true; doc: MarkdownDoc }
  | { ok: false; status: number; error: string };

export async function performCliDocUpdate(
  body: unknown,
  type: DocType,
  id: string,
  bot: Bot,
): Promise<CliDocUpdateOutcome> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 422, error: "文档数据无效" };
  }
  const record = body as Record<string, unknown>;

  // bot_id 定位：虾声明自己是哪只虾；服务端强制必须与 token 对应虾一致。
  if (record.bot_id !== undefined && record.bot_id !== null) {
    const claimedBotId = typeof record.bot_id === "string" ? record.bot_id.trim() : "";
    if (!claimedBotId || claimedBotId !== bot.id) {
      return { ok: false, status: 422, error: "bot_id 与当前虾不一致" };
    }
  }

  let docInput;
  let asset;
  try {
    const parsed = parseCliDocUpdate(record, type);
    docInput = parsed.docInput;
    asset = parsed.asset;
  } catch (error) {
    const message = error instanceof Error ? error.message : "解析失败";
    return { ok: false, status: 422, error: message };
  }

  // 机器接口无分类选择入口：frontmatter 缺分类字段给可读的明确报错（与创建路由一致）。
  if (docInput.type === "knowledge" ? !docInput.domain : !docInput.scenario) {
    return { ok: false, status: 422, error: docInput.type === "knowledge"
      ? "frontmatter 缺少领域字段 domain（必须从枚举选择一个）"
      : "frontmatter 缺少场景字段 scenario（必须从枚举选择一个）" };
  }

  // 发布者不变：ownerBotIds 由 updateDocFromBotUpload 保留原文档归属，不信任
  // 文件 frontmatter 里的归属，也不在此强制改写。authorUserId / createdAt 同理保留。
  const result = await updateDocFromBotUpload(type, id, { docInput, asset }, bot);
  if (!result.ok) return result;
  return { ok: true, doc: result.data };
}
