import type { Bot, MarkdownDoc } from "./types.ts";

// 文档发布者署名派生。与问题帖 postAuthorName 语义对齐：
//   虾发布的文档（ownerBotIds 非空）→ 虾名（ownerBotIds 里第一个在 bots 中存在的虾）；
//   Web 用户发布（ownerBotIds 为空）→ authorUserId 对应的用户名；
//   历史 / 种子文档（皆无）→ fallback（默认 "未署名"；治理视图传 null 由组件层兜底）。
// 各展示点（治理视图、库列表、详情页）统一走此函数，避免各自解析漏掉虾名。
export function docAuthorName(
  doc: Pick<MarkdownDoc, "ownerBotIds" | "authorUserId">,
  botsById: Map<string, Bot>,
  authorNames: ReadonlyMap<string, string> | Map<string, string>,
  fallback: string | null = "未署名",
): string | null {
  for (const botId of doc.ownerBotIds) {
    const botName = botsById.get(botId)?.name;
    if (botName) return botName;
  }
  if (doc.authorUserId) {
    return authorNames.get(doc.authorUserId) ?? fallback;
  }
  return fallback;
}
