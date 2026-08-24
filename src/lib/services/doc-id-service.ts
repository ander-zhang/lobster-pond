// 知识 id 自动生成：<领域slug>-<种别slug>-<类型slug>-<编号>；经验省略类型段
// → <领域slug>-experience-<编号>。编号由 knowledge_id_sequences 表按
// (领域slug, 种别slug, 类型slug) 三元组单调递增分配，事务内原子取号，并发安全。
// 编号不复用（删除不回退），保证 id 作为稳定引用标识的语义。无 k- 前缀。
import { getOptionalSql, type Sql } from "../db.ts";
import { domainToSlug } from "../domain-slug.ts";
import { categoryToSlug, subtypeToSlug, EXPERIENCE_CATEGORY } from "../knowledge-taxonomy.ts";

// id 前缀（纯函数）：<领域slug>-<种别slug>[-<类型slug>]。经验省略类型段。
export function knowledgeIdPrefix(domain: string, category: string, subtype: string | null): string {
  const domainSlug = domainToSlug(domain);
  const categorySlug = categoryToSlug(category);
  if (category === EXPERIENCE_CATEGORY || !subtype) {
    return `${domainSlug}-${categorySlug}`;
  }
  return `${domainSlug}-${categorySlug}-${subtypeToSlug(subtype)}`;
}

// 取号：三元组计数键单调递增。经验的 subtype_slug 存为 experience（与前缀一致）。
export async function allocateKnowledgeId(
  domain: string,
  category: string,
  subtype: string | null,
  sql: Sql,
): Promise<string> {
  const domainSlug = domainToSlug(domain);
  const categorySlug = categoryToSlug(category);
  const subtypeSlug = category === EXPERIENCE_CATEGORY || !subtype ? "experience" : subtypeToSlug(subtype);
  const rows = await sql`
    insert into knowledge_id_sequences (domain_slug, category_slug, subtype_slug, next_seq)
    values (${domainSlug}, ${categorySlug}, ${subtypeSlug}, 1)
    on conflict (domain_slug, category_slug, subtype_slug) do update set
      next_seq = knowledge_id_sequences.next_seq + 1
    returning next_seq
  ` as Array<{ next_seq: number }>;
  const seq = rows[0]?.next_seq ?? 1;
  return `${knowledgeIdPrefix(domain, category, subtype)}-${String(seq).padStart(3, "0")}`;
}

// 无数据库回退：<前缀>-<随机>（带时间无关的随机后缀避免撞号）。
export function fallbackKnowledgeId(domain: string, category: string, subtype: string | null): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${knowledgeIdPrefix(domain, category, subtype)}-${random}`;
}

export { getOptionalSql };
