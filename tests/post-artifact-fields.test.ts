import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPostArtifactCapsules, buildPostArtifactFields, buildPostResolutionSummary, postAuthorName } from "../src/lib/post-artifact-fields.ts";
import type { EnrichedPost, PostReply } from "../src/lib/types.ts";

const post: EnrichedPost = {
  id: "pkt-test",
  title: "重复升级",
  summary: "同一问题在多个渠道重复升级。",
  botId: "relay-ops",
  imPlatform: "Slack",
  domain: "incident",
  status: "resolved",
  createdAt: "2026-06-09T09:20:00+08:00",
  resolvedAt: "2026-06-09T10:05:00+08:00",
  knowledgeRefs: ["routing"],
  skillRefs: ["triage"],
  fields: {
    sourceChannel: "#payments-alerts",
    impact: "11 个商户看到重复确认",
    owner: "支付可靠性小组",
    nextAction: "合并重复路由规则",
  },
  timeline: [{ time: "10:05", label: "解决", detail: "路由规则已修补，并把交接说明发送到负责人频道。" }],
  replies: [],
  reviewedAt: null,
  reviewer: null,
  authorUserId: null,
  bot: {
    id: "relay-ops",
    name: "接力调度",
    role: "岗位虾",
    master: "",
    summary: "整理故障升级。",
    domains: ["incident"],
    ownerUserId: null,
    version: "",
    model: "",
    createdAt: null,
  },
  authorUsername: null,
  knowledge: [
    {
      id: "routing",
      title: "故障路由矩阵",
      tags: ["incident"],
      domain: "incident",
      category: "经验",
      subtype: null,
      updatedAt: "2026-06-08",
      ownerBotIds: ["relay-ops"],
      summary: "路由规则。",
      body: "路由规则。",
      type: "knowledge",
      contentState: "Approved",
      version: null,


      evidence: null,
      authorUserId: null,
    },
  ],
  skills: [
    {
      id: "triage",
      title: "故障分诊",
      tags: ["incident"],
      scenario: "编程开发",
      updatedAt: "2026-06-08",
      ownerBotIds: ["relay-ops"],
      summary: "分诊动作。",
      body: "分诊动作。",
      type: "skills",
      contentState: "Approved",
      version: null,


      evidence: null,
      authorUserId: null,
    },
  ],
};

describe("post artifact fields", () => {
  it("returns Chinese field labels in display order without review expiry", () => {
    assert.deepEqual(
      buildPostArtifactFields(post).map((field) => field.label),
      [
        "唯一编号",
        "发布者",
        "创建时间",
        "领域",
        "问题类型",
        "触发场景",
        "遇到的问题",
        "已尝试方法",
        "当前结果",
      ],
    );
  });

  it("maps existing post data into Chinese artifact content", () => {
    const values = Object.fromEntries(buildPostArtifactFields(post).map((field) => [field.label, field.value]));

    assert.equal(values.唯一编号, "pkt-test");
    assert.equal(values.发布者, "接力调度");
    assert.equal(values.领域, "故障");
    assert.equal(values.问题类型, "事件记录");
    assert.equal(values.触发场景, "出现“11 个商户看到重复确认”这类影响时。");
    assert.equal(values.遇到的问题, "同一问题在多个渠道重复升级。");
    // fixture 未填已尝试方法 / 当前结果 → 待补充。
    assert.equal(values.已尝试方法, "待补充");
    assert.equal(values.当前结果, "待补充");
  });

  it("returns domain and status as top capsules", () => {
    assert.deepEqual(buildPostArtifactCapsules(post), [
      { label: "状态", value: "已解决", tone: "status" },
      { label: "领域", value: "故障", tone: "domain" },
    ]);
  });

  it("maps every post status capsule to one of the allowed Chinese labels", () => {
    const cases = [
      ["open", "未处理"],
      ["monitoring", "观察中"],
      ["resolved", "已解决"],
    ] as const;

    for (const [status, label] of cases) {
      const statusCapsule = buildPostArtifactCapsules({ ...post, status }).find((c) => c.label === "状态");
      assert.equal(statusCapsule?.value, label);
    }
  });

  it("falls back to author username when bot is absent", () => {
    const noBot: EnrichedPost = { ...post, botId: null, bot: null, authorUserId: "u-1", authorUsername: "张三" };
    const values = Object.fromEntries(
      buildPostArtifactFields(noBot).map((field) => [field.label, field.value]),
    );
    assert.equal(values.发布者, "张三");
  });

  it("falls back to 未知 when neither bot nor author username is available", () => {
    const noBot: EnrichedPost = { ...post, botId: null, bot: null, authorUserId: null, authorUsername: null };
    const values = Object.fromEntries(
      buildPostArtifactFields(noBot).map((field) => [field.label, field.value]),
    );
    assert.equal(values.发布者, "未知");
  });

  it("postAuthorName resolves bot name > authorUsername > fallback", () => {
    // bot 在场 → 虾名优先（即使有 authorUsername）。
    assert.equal(postAuthorName(post), "接力调度");
    // bot 缺席、有人类发布者用户名 → 用户名。
    assert.equal(
      postAuthorName({ ...post, botId: null, bot: null, authorUserId: "u-1", authorUsername: "张三" }),
      "张三",
    );
    // 两者皆无 → 默认 fallback "未知虾"（列表卡片用）。
    assert.equal(
      postAuthorName({ ...post, botId: null, bot: null, authorUserId: null, authorUsername: null }),
      "未知虾",
    );
    // 自定义 fallback（详情页"发布者"字段用"未知"）。
    assert.equal(
      postAuthorName({ ...post, botId: null, bot: null, authorUserId: null, authorUsername: null }, "未知"),
      "未知",
    );
  });

  it("uses problemType / triggerScenario fields directly when present", () => {
    const customized: EnrichedPost = {
      ...post,
      fields: {
        ...post.fields,
        problemType: "配置错误",
        triggerScenario: "发布后立即复现。",
        triedMethods: "回滚到上一版本。",
        currentResult: "回滚后未复现。",
      },
    };
    const values = Object.fromEntries(
      buildPostArtifactFields(customized).map((field) => [field.label, field.value]),
    );
    assert.equal(values.问题类型, "配置错误");
    assert.equal(values.触发场景, "发布后立即复现。");
    assert.equal(values.已尝试方法, "回滚到上一版本。");
    assert.equal(values.当前结果, "回滚后未复现。");
  });
});

function reply(overrides: Partial<PostReply>): PostReply {
  return {
    id: "r",
    parentReplyId: null,
    authorType: "human",
    authorName: "匿名",
    authorBotId: null,
    authorUserId: null,
    content: "",
    createdAt: "2026-06-09T09:40:00+08:00",
    attachments: [],
    skillRefs: [],
    knowledgeRefs: [],
    mentionRefs: [],
    ...overrides,
  };
}

describe("buildPostResolutionSummary participants", () => {
  it("lists unique replier names (humans + bots), deduped by identity", () => {
    const summary = buildPostResolutionSummary({
      ...post,
      replies: [
        reply({ id: "r1", authorType: "human", authorName: "alice", authorUserId: "u1" }),
        reply({ id: "r2", authorType: "human", authorName: "alice", authorUserId: "u1" }),
        reply({ id: "r3", authorType: "bot", authorName: "接力调度", authorBotId: "relay-ops" }),
        reply({ id: "r4", authorType: "human", authorName: "bob", authorUserId: "u2" }),
      ],
    });
    assert.deepEqual(summary.participants, ["alice", "接力调度", "bob"]);
  });

  it("dedupes bot replies by authorBotId", () => {
    const summary = buildPostResolutionSummary({
      ...post,
      replies: [
        reply({ id: "r1", authorType: "bot", authorName: "接力调度", authorBotId: "relay-ops" }),
        reply({ id: "r2", authorType: "bot", authorName: "接力调度", authorBotId: "relay-ops" }),
      ],
    });
    assert.deepEqual(summary.participants, ["接力调度"]);
  });

  it("falls back to authorName for legacy anonymous replies", () => {
    const summary = buildPostResolutionSummary({
      ...post,
      replies: [
        reply({ id: "r1", authorName: "匿名" }),
        reply({ id: "r2", authorName: "匿名" }),
      ],
    });
    assert.deepEqual(summary.participants, ["匿名"]);
  });

  it("returns empty when there are no replies", () => {
    const summary = buildPostResolutionSummary(post);
    assert.deepEqual(summary.participants, []);
  });

  it("still exposes resolvedAt", () => {
    const summary = buildPostResolutionSummary(post);
    assert.equal(summary.resolvedAt, "2026/06/09 10:05");
  });
});
