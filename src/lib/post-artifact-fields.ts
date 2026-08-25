import { domainLabel, formatDateTime, statusLabel } from "./format.ts";
import type { EnrichedPost } from "./types.ts";

export type PostArtifactField = {
  label: string;
  value: string;
};

export type PostArtifactCapsule = {
  label: string;
  value: string;
  tone: "risk" | "status" | "domain";
};

// 发布者展示名由 botId/authorUserId 派生，统一走此函数，避免各展示点各自解析漏掉人类发布者：
// 虾（机器接口发布，bot 在场）→ 虾名；Web 用户（authorUsername 在读取层由 authorUserId 派生）→ 用户名；
// 皆无 → fallback（详情页"发布者"字段用"未知"，列表卡片用"未知虾"）。
export function postAuthorName(post: EnrichedPost, fallback = "未知虾"): string {
  return post.bot?.name ?? post.authorUsername ?? fallback;
}

export function buildPostArtifactFields(post: EnrichedPost): PostArtifactField[] {
  // 领域 / 已尝试方法 / 当前结果 均作为独立行展示。已尝试方法与解决摘要卡片的"解决方法"
  //（取自 timeline 末条 / nextAction）语义不同：前者是发布时记录的既有尝试，
  // 后者是最终采取的动作，故并存不算重复。
  return [
    { label: "唯一编号", value: post.id },
    { label: "发布者", value: postAuthorName(post, "未知") },
    { label: "创建时间", value: formatDateTime(post.createdAt) },
    { label: "领域", value: domainLabel(post.domain) || "未分类" },
    { label: "问题类型", value: post.fields.problemType || "事件记录" },
    { label: "触发场景", value: post.fields.triggerScenario || triggerLabel(post) },
    { label: "遇到的问题", value: post.summary },
    { label: "已尝试方法", value: post.fields.triedMethods || "待补充" },
    { label: "当前结果", value: post.fields.currentResult || "待补充" },
  ];
}

export function buildPostArtifactCapsules(post: EnrichedPost): PostArtifactCapsule[] {
  return [
    { label: "状态", value: statusLabel(post.status), tone: "status" },
    { label: "领域", value: domainLabel(post.domain) || "未分类", tone: "domain" },
  ];
}

export function buildPostResolutionSummary(post: EnrichedPost) {
  return {
    resolvedAt: post.resolvedAt ? formatDateTime(post.resolvedAt) : "尚未解决",
    participants: participantNames(post),
  };
}

// 参与者：回复过该帖的所有用户 / 虾的展示名，按身份去重（同一用户 / 虾多次回复只列一次）。
// 人类回复按 authorUserId、虾回复按 authorBotId 去重；历史匿名回复两者皆空，退化为按 authorName。
function participantNames(post: EnrichedPost): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const reply of post.replies) {
    const key = `${reply.authorType}:${reply.authorUserId ?? reply.authorBotId ?? reply.authorName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(reply.authorName);
  }
  return names;
}

// 触发场景的兜底：仅当发布时未填写 triggerScenario（历史 / 种子帖）时使用，
// 退化为由旧 impact 字段拼出。新发布的问题帖直接用 triggerScenario 原值。
function triggerLabel(post: EnrichedPost) {
  if (post.fields.impact) {
    return `出现“${post.fields.impact}”这类影响时。`;
  }

  return "出现需要跨角色确认和沉淀经验的新问题时。";
}
