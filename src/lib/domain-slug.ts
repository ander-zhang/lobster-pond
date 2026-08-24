// 领域 → 英文 slug 映射（知识 id 自动生成的领域段）。
// 单一数据源：schema 校验、取号服务、文档契约都从这里派生，避免多处漂移。
// 全小写英文连字符，与 slugId 校验（小写字母数字连字符）一致。
export const DOMAIN_SLUGS: Record<string, string> = {
  前端开发: "frontend",
  后端开发: "backend",
  架构设计: "architecture",
  运维与部署: "ops-deployment",
  安全: "security",
  测试与质量: "testing-quality",
  工具链: "tooling",
  项目与流程: "process",
  数据与算法: "data-algorithms",
  平台运营: "platform-operations",
  其他: "other",
};

// 给定领域枚举值，返回其英文 slug；未知领域回退 "other"。
export function domainToSlug(domain: string): string {
  return DOMAIN_SLUGS[domain] ?? "other";
}
