import type { ContentState, PostStatus } from "./types";

// 平台运营时区。帖子时间戳带 +08:00，统一按上海时区计算"当天"，
// 避免服务器时区与数据时区错位导致跨日误判。
const PLATFORM_TIMEZONE = "Asia/Shanghai";

// 把 UTC ISO 时间戳转成北京时间（Asia/Shanghai，+08:00）的 ISO 8601 字符串，
// 供 MCP / CLI 返回给虾时展示本地时刻。输入为非法/非 ISO 值或 null 时原样透传，
// 不强行转换（timeline.time 等自由文本字段不应被误伤）。
export function toBeijingIso(input: string | null | undefined): string | null {
  if (!input) return input ?? null;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return input;
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PLATFORM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const millis = String(date.getMilliseconds()).padStart(3, "0");
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}.${millis}+08:00`;
}

// 返回某时刻在平台时区下的日期键（YYYY-MM-DD）。
export function dateKeyInTimezone(input: string | Date, timeZone: string = PLATFORM_TIMEZONE): string {
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  // en-CA 的 YYYY-MM-DD 格式天然可按字典序比较。
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// 平台时区下的"今天"日期键。
export function todayKey(timeZone: string = PLATFORM_TIMEZONE): string {
  return dateKeyInTimezone(new Date(), timeZone);
}

// 平台时区下，截至今天的最近 N 天日期键（含今天），用于"连续 N 天"活跃判定。
// Asia/Shanghai 无夏令时，按毫秒回退安全。
export function trailingDateKeys(days: number, timeZone: string = PLATFORM_TIMEZONE): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    keys.push(dateKeyInTimezone(new Date(now.getTime() - i * 86_400_000), timeZone));
  }
  return keys;
}

// 平台时区下，当前自然周（周一至周日）的 7 个日期键，用于"本周"窗口判定。
// 起始周一由 Intl weekday 推出；Asia/Shanghai 无夏令时，按毫秒步进安全。
const WEEKDAY_OFFSET: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};
export function currentWeekDateKeys(timeZone: string = PLATFORM_TIMEZONE): string[] {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now);
  const offset = WEEKDAY_OFFSET[weekday] ?? 0;
  const mondayMs = now.getTime() - offset * 86_400_000;
  const keys: string[] = [];
  for (let i = 0; i < 7; i++) {
    keys.push(dateKeyInTimezone(new Date(mondayMs + i * 86_400_000), timeZone));
  }
  return keys;
}

export function formatDate(input: string | null) {
  if (!input) {
    return "待确认";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(input));
}

// 年月日 + 时分（平台时区 Asia/Shanghai）。用于需要精到时分且含年份的场景
// （如文档修订时刻）：formatDate 无年份、formatDateOnly 无时分，此函数补齐。
// 输入须为带时区的 ISO 时间戳（如 docs.revised_at）；纯日期无时刻数据，不应传入。
export function formatDateTime(input: string | Date | null): string {
  if (!input) {
    return "待确认";
  }
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return String(input);
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PLATFORM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

// 仅日期（年/月/日）。用于知识 / 技能等只记录上传日期、无时间成分的场景——
// docs.updated_at 存的是 YYYY-MM-DD 纯日期，直接按字符串切片重组，避免被解析成
// UTC 零点后按时区显示成带时分（那个时间是假的）。
export function formatDateOnly(input: string | Date | null) {
  if (!input) {
    return "待确认";
  }
  if (input instanceof Date) {
    return dateKeyInTimezone(input).replaceAll("-", "/");
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
  if (!match) {
    return String(input);
  }
  return `${match[1]}/${match[2]}/${match[3]}`;
}

export function statusLabel(status: PostStatus) {
  return {
    open: "未处理",
    monitoring: "观察中",
    resolved: "已解决",
  }[status];
}

export function docTypeLabel(type: "knowledge" | "skills") {
  return {
    knowledge: "知识",
    skills: "技能",
  }[type];
}

export function domainLabel(domain: string | null): string {
  if (!domain) {
    return "";
  }
  return (
    {
      analytics: "分析",
      approval: "审批",
      compliance: "合规",
      contract: "契约",
      data: "数据",
      debugging: "调试",
      docs: "文档",
      evaluation: "评测",
      incident: "故障",
      knowledge: "知识",
      operations: "运营",
      policy: "规则",
      prompt: "提示词",
      query: "查询",
      review: "评审",
      routing: "路由",
      sla: "SLA",
      ux: "体验",
    }[domain] ?? domain
  );
}

export function domainBadgeClass(domain: string | null): string {
  // 彩色领域：底色填充 + border-transparent。调用方 base 带 border 宽度时为不可见边框
  // （与描边兄弟徽标等高）；无 border 宽度时 border-transparent 无副作用、仅显底色。
  if (domain === "数据与算法") return "border-transparent bg-[#00BFA5] text-white";
  if (domain === "工具链") return "border-transparent bg-[#1E88E5] text-white";
  if (domain === "架构设计") return "border-transparent bg-[#E53935] text-white";
  if (domain === "前端开发") return "border-transparent bg-[#4CAF50] text-white";
  if (domain === "测试与质量") return "border-transparent bg-[#8D6E63] text-white";
  if (domain === "运维与部署") return "border-transparent bg-[#7E57C2] text-white";
  if (domain === "安全") return "border-transparent bg-[#FDD835] text-[var(--text-primary)]";
  if (domain === "项目与流程") return "border-transparent bg-[#29B6F6] text-white";
  if (domain === "后端开发") return "border-transparent bg-[#FF9800] text-white";
  if (domain === "平台运营") return "border-transparent bg-[#B71C1C] text-white";
  // 「其他」与未识别领域：描边胶囊（hairline 边框 + 白底 + 次级文字色）；
  // 由本处 border 或调用方 base 的 border 宽度保证可见边框。
  return "border border-[var(--hairline)] bg-white text-[var(--text-secondary)]";
}

// 技能场景徽标文案：中文场景值原样返回（预留映射位，与 domainLabel 同形）。
// 场景徽标不做配色（统一中性样式），故无 scenarioBadgeClass。
export function scenarioLabel(scenario: string | null): string {
  return scenario ?? "";
}

// 内容状态机（§5）。中文短标签 + 一句话含义，供徽章与图例复用。
export function contentStateLabel(state: ContentState): string {
  return {
    Approved: "已批准",
    "Needs Review": "待审核",
    "Needs Attention": "待留意",
    Reviewing: "复盘中",
  }[state];
}

export function contentStateMeaning(state: ContentState): string {
  return {
    Approved: "已批准，可在正式任务中检索、引用或调用。",
    "Needs Review": "需要人工复审，谨慎使用。",
    "Needs Attention": "已批准内容收到新评论，等待发布者确认是否需要更新。",
    Reviewing: "已驳回，等待修订复盘。",
  }[state];
}

// 是否可在正式任务中使用：yes=Approved，caution=待复审。
export function contentStateFormalUse(state: ContentState): "yes" | "caution" {
  if (state === "Approved") {
    return "yes";
  }
  return "caution";
}

// 徽章配色方案，映射到 globals.css 中的状态色板类。
export function contentStateBadgeClass(state: ContentState): string {
  return {
    Approved: "state-badge-mint",
    "Needs Review": "state-badge-amber",
    "Needs Attention": "state-badge-orange",
    Reviewing: "state-badge-amber",
  }[state];
}
