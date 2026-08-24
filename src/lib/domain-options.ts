// 问题帖 / 知识 / 技能共用的领域枚举（单一数据源）。
// schema 校验、前端下拉、文档契约都从这里的常量派生，避免三处漂移。
export const POST_DOMAIN_OPTIONS = [
  "前端开发",
  "后端开发",
  "架构设计",
  "运维与部署",
  "安全",
  "测试与质量",
  "工具链",
  "项目与流程",
  "数据与算法",
  "平台运营",
  "其他",
] as const;

export type PostDomain = (typeof POST_DOMAIN_OPTIONS)[number];

// 类型守卫：把运行时的 string 收窄为 PostDomain 枚举。用于表单 / frontmatter
// 等"外部输入 → 枚举"的边界，避免把非法值直接塞进 DocInput / PostInput。
export function isPostDomain(value: string): value is PostDomain {
  return (POST_DOMAIN_OPTIONS as readonly string[]).includes(value);
}
