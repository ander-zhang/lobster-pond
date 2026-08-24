import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessReviewRequirement,
  buildOperationalMetrics,
  buildTemplateDraft,
  canUseContentStateForFormalTask,
  getHelpWorkbench,
} from "../src/lib/help-workbench.ts";
import type { MarkdownDoc, Post } from "../src/lib/types.ts";

const posts: Post[] = [
  {
    id: "pkt-a",
    title: "已解决并引用知识",
    summary: "summary",
    botId: "bot-a",
    imPlatform: "im",
    domain: "policy",
    status: "resolved",
    createdAt: "2026-06-14T01:00:00.000Z",
    resolvedAt: "2026-06-14T02:00:00.000Z",
    knowledgeRefs: ["kb-a"],
    skillRefs: ["skill-a"],
    fields: {},
    timeline: [],
    replies: [],
    reviewedAt: null,
    reviewer: null,
    authorUserId: null,
  },
  {
    id: "pkt-b",
    title: "高风险待处理",
    summary: "summary",
    botId: "bot-b",
    imPlatform: "im",
    domain: "data",
    status: "open",
    createdAt: "2026-06-14T03:00:00.000Z",
    resolvedAt: null,
    knowledgeRefs: [],
    skillRefs: [],
    fields: {},
    timeline: [],
    replies: [],
    reviewedAt: null,
    reviewer: null,
    authorUserId: null,
  },
];

const docs: MarkdownDoc[] = [
  {
    id: "kb-a",
    title: "知识 A",
    tags: [],
    domain: "policy",
    category: "经验",
    subtype: null,
    updatedAt: "2026-06-14",
    ownerBotIds: ["bot-a"],
    summary: "summary",
    body: "body",
    type: "knowledge",
    contentState: "Approved",
    version: null,


    evidence: null,
    authorUserId: null,
  },
  {
    id: "skill-a",
    title: "技能 A",
    tags: [],
    scenario: "编程开发",
    updatedAt: "2026-06-14",
    ownerBotIds: ["bot-a"],
    summary: "summary",
    body: "body",
    type: "skills",
    contentState: "Approved",
    version: null,


    evidence: null,
    authorUserId: null,
  },
];

describe("help workbench", () => {
  it("models the five core platform objects from the help document", () => {
    const workbench = getHelpWorkbench();

    assert.deepEqual(
      workbench.objectTypes.map((item) => item.key),
      ["question", "experience", "knowledge", "skill", "reply"],
    );
  });

  it("marks only Approved as formally usable", () => {
    assert.equal(canUseContentStateForFormalTask("Approved"), true);
    assert.equal(canUseContentStateForFormalTask("Needs Review"), false);
    assert.equal(canUseContentStateForFormalTask("Needs Attention"), false);
  });

  it("exposes the knowledge loop and the skill loop as ordered workflows", () => {
    const workbench = getHelpWorkbench();

    assert.deepEqual(workbench.workflows.map((workflow) => workflow.key), ["knowledge-loop", "skill-loop"]);
    assert.deepEqual(workbench.workflows[0]?.steps, [
      "问题发布",
      "虾和人类回复",
      "经验产生",
      "候选知识抽取",
      "去重、脱敏、冲突检查",
      "验证和审核",
      "发布为共享知识",
      "检索使用",
      "记录使用效果",
      "继续修订、升级或淘汰",
    ]);
    assert.equal(workbench.workflows[1]?.steps.at(-1), "持续优化或回滚");
  });

  it("contains operational templates for publishing, replying, and skill proposals", () => {
    const workbench = getHelpWorkbench();

    assert.deepEqual(
      workbench.templates.map((template) => template.key),
      ["question", "knowledge", "skill", "daily", "reply"],
    );
    assert.ok(workbench.templates.find((template) => template.key === "question")?.fields.includes("相关证据"));
    assert.ok(workbench.templates.find((template) => template.key === "skill")?.fields.includes("失败处理"));
    assert.ok(workbench.templates.find((template) => template.key === "reply")?.fields.includes("是否需要人工确认"));
  });

  it("surfaces review gates, daily operations, safety rules, RAG steps, and platform metrics", () => {
    const workbench = getHelpWorkbench();

    assert.ok(workbench.reviewRules.manualReview.some((item) => item.includes("财务、法务、权限、隐私")));
    assert.ok(workbench.dailyOperations.night.includes("生成候选 Skill"));
    assert.ok(workbench.safetyRules.includes("不得发布密钥、Token、密码、Cookie。"));
    assert.equal(workbench.ragSteps[0], "用户或虾提出问题");
    assert.ok(workbench.metrics.includes("知识复用次数"));
    assert.ok(workbench.metrics.includes("高风险拦截次数"));
  });

  it("calculates operational metrics from current posts and docs", () => {
    const metrics = buildOperationalMetrics(posts, docs);
    const values = Object.fromEntries(metrics.map((metric) => [metric.label, metric.value]));

    assert.equal(values.问题解决率, "50%");
    assert.equal(values.知识转化率, "50%");
    assert.equal(values["Skill 转化率"], "50%");
    assert.equal(values.知识复用次数, "1");
  });

  it("generates a structured draft from a selected template", () => {
    const template = getHelpWorkbench().templates.find((item) => item.key === "question");

    assert.ok(template);
    assert.equal(
      buildTemplateDraft(template),
      [
        "标题：",
        "",
        "背景：",
        "",
        "触发条件：",
        "",
        "已尝试方法：",
        "",
        "当前结果：",
        "",
        "期望结果：",
        "",
        "相关证据：",
        "",
        "适用范围：",
        "",
      ].join("\n"),
    );
  });

  it("classifies review requirements from risk flags", () => {
    assert.deepEqual(
      assessReviewRequirement({
        touchesSensitiveData: false,
        touchesProductionSystem: false,
        conflictsExistingKnowledge: false,
        replacesOldRule: false,
      }),
      {
        mode: "automatic",
        title: "可进入自动发布候选",
        reasons: ["低风险内容仍需满足来源可靠、无敏感信息、无冲突和适用范围明确。"],
      },
    );

    assert.deepEqual(
      assessReviewRequirement({
        touchesSensitiveData: true,
        touchesProductionSystem: false,
        conflictsExistingKnowledge: false,
        replacesOldRule: false,
      }),
      {
        mode: "manual",
        title: "必须人工审核",
        reasons: ["涉及财务、法务、权限、隐私或生产系统的内容。"],
      },
    );
  });
});
