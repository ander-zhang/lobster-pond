import type { MarkdownDoc } from "./types";

export type LibraryDocFilters = {
  domain: string;
  botId: string;
  /** 种别（二级）；"all" 或空视为不过滤。 */
  category?: string;
  /** 类型（三级）；"all" 或空视为不过滤。 */
  subtype?: string;
  /** 关键词，匹配标题 / ID / 摘要（大小写不敏感）；空白视为不过滤。 */
  query?: string;
};

// 知识库只在正式可用内容中筛选；选择具体虾时，多虾归属文档命中任一关联虾即可。
export function filterLibraryDocs(docs: MarkdownDoc[], filters: LibraryDocFilters): MarkdownDoc[] {
  const query = (filters.query ?? "").trim().toLowerCase();
  const category = filters.category ?? "all";
  const subtype = filters.subtype ?? "all";
  return docs.filter((doc) => {
    const matchesDomain = filters.domain === "all"
      || (doc.type === "knowledge" ? doc.domain === filters.domain : doc.scenario === filters.domain);
    const matchesBot = filters.botId === "all" || doc.ownerBotIds.includes(filters.botId);
    const matchesCategory = category === "all" || category === "" || (doc.type === "knowledge" && doc.category === category);
    const matchesSubtype = subtype === "all" || subtype === "" || (doc.type === "knowledge" && doc.subtype === subtype);
    const matchesQuery = !query
      || doc.title.toLowerCase().includes(query)
      || doc.id.toLowerCase().includes(query)
      || doc.summary.toLowerCase().includes(query);
    return matchesDomain && matchesBot && matchesCategory && matchesSubtype && matchesQuery;
  });
}
