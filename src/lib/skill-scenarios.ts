// 技能场景分类的单一数据源：8 个 AI 用途场景值与类型守卫。
// schema 校验、前端下拉、文档契约都从这里派生，避免多处漂移。
// 与 domain-options.ts / knowledge-taxonomy.ts 同款模式；仅适用于技能（.zip/.tar.gz）。
// 技能 id 取自 frontmatter slug（不走 knowledge_id_sequences），场景不进 URL/路由，故无 slug 映射。

export const SKILL_SCENARIO_OPTIONS = [
  "办公协同",
  "内容创作",
  "数据分析",
  "知识管理",
  "研究洞察",
  "编程开发",
  "兴趣生活",
  "其他",
] as const;

export type SkillScenario = (typeof SKILL_SCENARIO_OPTIONS)[number];

// 类型守卫：把运行时 string 收窄为 SkillScenario 枚举。用于表单 / frontmatter 等
// "外部输入 → 枚举"的边界，避免把非法值直接塞进 DocInput。
export function isSkillScenario(value: string): value is SkillScenario {
  return (SKILL_SCENARIO_OPTIONS as readonly string[]).includes(value);
}
