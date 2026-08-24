// 知识三级分类的单一数据源：默认种别（全局 6）+ 领域级覆盖（平台运营 10 种别），
// 种别→类型（三级）级联表，以及种别 / 类型 → 英文 slug 映射（供知识 id 自动生成）。
// schema 校验、表单下拉、id 生成、筛选都从这里派生，避免多处漂移。
// 与 domain-options.ts / domain-slug.ts 同款模式；仅适用于知识（.md）。

// 默认种别（未在 DOMAIN_CATEGORY_OVERRIDES 覆盖的领域使用）。
export const KNOWLEDGE_CATEGORY_OPTIONS = [
  "标准",
  "方法",
  "工具",
  "案例",
  "体系",
  "经验",
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORY_OPTIONS)[number];

// 经验无三级：在默认与平台运营种别集中均无类型。
export const EXPERIENCE_CATEGORY = "经验";

// 默认种别 → 类型（三级）列表。经验为空数组。
export const KNOWLEDGE_SUBTYPE_MAP: Record<KnowledgeCategory, readonly string[]> = {
  标准: ["编码标准", "接口标准", "数据标准", "安全基线"],
  方法: [
    "操作指南",
    "维护手册",
    "故障排查手册",
    "性能压测报告",
    "容量评估报告",
    "方案评审表",
    "上线检查单",
    "故障复盘报告",
    "安全演练方案",
    "竞品调研方案",
    "竞品调研报告",
  ],
  工具: [
    "操作规程",
    "使用手册",
    "选型评估报告",
    "采购文档",
    "部署验收报告",
    "配置基线",
    "能力介绍材料",
    "工具台账",
  ],
  案例: ["典型故障报告", "根因分析", "线上问题复盘", "专项策划"],
  体系: ["应急预案", "风险评估", "岗位操作规程"],
  经验: [],
};

// 领域级种别覆盖：平台运营用自定义 10 种别。未列出的领域用默认 6 种别。
export const DOMAIN_CATEGORY_OVERRIDES: Partial<Record<string, readonly string[]>> = {
  平台运营: [
    "体系",
    "白皮书",
    "功能介绍",
    "接入申请",
    "新人上手",
    "平台手册",
    "治理规范",
    "便捷指南",
    "迭代规划",
    "经验",
  ],
};

// 领域级类型覆盖：平台运营·体系 用自定义 4 类型；平台运营其余种别无类型
// （回落默认表，其中只经验为空，其余平台运营种别不在默认表 → undefined → []）。
export const DOMAIN_SUBTYPE_OVERRIDES: Record<string, Record<string, readonly string[]>> = {
  平台运营: {
    体系: ["使用手册", "管理流程", "管理办法", "审核条款"],
  },
};

// 某领域的种别列表：覆盖表 ?? 默认 6。
export function categoriesForDomain(domain: string): readonly string[] {
  return DOMAIN_CATEGORY_OVERRIDES[domain] ?? KNOWLEDGE_CATEGORY_OPTIONS;
}

// 某领域某种别的类型列表：领域覆盖 ?? 默认表 ?? []。
export function subtypesForDomainCategory(domain: string, category: string): readonly string[] {
  const domainOverride = DOMAIN_SUBTYPE_OVERRIDES[domain]?.[category];
  if (domainOverride) return domainOverride;
  return (KNOWLEDGE_SUBTYPE_MAP as Record<string, readonly string[]>)[category] ?? [];
}


// 种别 → 英文 slug（用于 id 段）。经验固定 experience；平台运营新种别补入。
// 未知回退 experience（不会撞已有枚举 slug 语义）。
export const CATEGORY_SLUGS: Record<string, string> = {
  标准: "standard",
  方法: "method",
  工具: "tool",
  案例: "case",
  体系: "system",
  经验: "experience",
  // 平台运营
  白皮书: "whitepaper",
  功能介绍: "feature-intro",
  接入申请: "access-request",
  新人上手: "onboarding",
  平台手册: "platform-manual",
  治理规范: "governance-spec",
  便捷指南: "quick-guide",
  迭代规划: "roadmap",
};

// 类型 → 英文 slug（用于 id 段）。键覆盖默认 + 平台运营全部类型。
export const SUBTYPE_SLUGS: Record<string, string> = {
  // 标准
  编码标准: "coding-standard",
  接口标准: "api-standard",
  数据标准: "data-standard",
  安全基线: "security-baseline",
  // 方法
  操作指南: "operation-guide",
  维护手册: "maintenance-manual",
  故障排查手册: "troubleshooting",
  性能压测报告: "perf-test-report",
  容量评估报告: "capacity-report",
  方案评审表: "solution-review",
  上线检查单: "release-checklist",
  故障复盘报告: "incident-review",
  安全演练方案: "drill-plan",
  竞品调研方案: "research-plan",
  竞品调研报告: "research-report",
  // 工具
  操作规程: "operation-spec",
  使用手册: "user-manual",
  选型评估报告: "selection-report",
  采购文档: "procurement-doc",
  部署验收报告: "deployment-acceptance",
  配置基线: "config-baseline",
  能力介绍材料: "capability-intro",
  工具台账: "tool-ledger",
  // 案例
  典型故障报告: "typical-incident-report",
  根因分析: "root-cause-analysis",
  线上问题复盘: "online-issue-review",
  专项策划: "special-planning",
  // 体系（默认）
  应急预案: "emergency-plan",
  风险评估: "risk-assessment",
  岗位操作规程: "operation-procedure",
  // 体系（平台运营）
  管理流程: "management-process",
  管理办法: "management-rule",
  审核条款: "audit-clause",
};

// 种别 slug：查表，未知回退 experience。
export function categoryToSlug(category: string): string {
  return CATEGORY_SLUGS[category] ?? "experience";
}

// 类型 slug：查表，未知回退 general。
export function subtypeToSlug(subtype: string): string {
  return SUBTYPE_SLUGS[subtype] ?? "general";
}

// 类型守卫：把运行时 string 收窄为默认 KnowledgeCategory（全局 6）。保留供兼容。
export function isKnowledgeCategory(value: string): value is KnowledgeCategory {
  return (KNOWLEDGE_CATEGORY_OPTIONS as readonly string[]).includes(value);
}

// 领域级级联校验：subtype 是否与 (domain, category) 匹配。
//   - category 须属于该领域种别列表，否则 false。
//   - 该领域+种别无类型 → subtype 须为空。
//   - 否则 subtype 须非空且属于该列表。
export function isKnowledgeSubtype(
  domain: string,
  category: string,
  subtype: string | null | undefined,
): boolean {
  if (!categoriesForDomain(domain).includes(category)) return false;
  const trimmed = (subtype ?? "").trim();
  const subtypes = subtypesForDomainCategory(domain, category);
  if (subtypes.length === 0) return trimmed.length === 0;
  return trimmed.length > 0 && subtypes.includes(trimmed);
}
