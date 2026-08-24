import { POST_DOMAIN_OPTIONS } from "./domain-options";

// 前端问题帖领域下拉 / 知识库筛选下拉共用。由 POST_DOMAIN_OPTIONS 派生，
// 与后端 schema 校验（schemas.ts 的 z.enum(POST_DOMAIN_OPTIONS)）保持一致。
export const QUESTION_POST_DOMAIN_FILTER_OPTIONS = POST_DOMAIN_OPTIONS.map((domain) => ({ value: domain, label: domain }));

export function questionPostDomainFilterLabels() {
  return ["全部", ...QUESTION_POST_DOMAIN_FILTER_OPTIONS.map((option) => option.label)];
}
