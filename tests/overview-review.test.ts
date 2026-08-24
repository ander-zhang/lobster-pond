import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPendingReviewItems, monitoringEnteredDateKey } from "../src/lib/overview.ts";
import type { MarkdownDoc, Post, PostReply, PostStatus } from "../src/lib/types.ts";

// 本周待复审窗口：固定用 2026-08-03（周一）至 2026-08-09（周日）七天，
// 避免依赖"当前周"导致测试非确定。时间戳统一带 +08:00（平台时区）。
const WEEK = new Set(["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"]);

function reply(createdAt: string, overrides: Partial<PostReply> = {}): PostReply {
  return {
    id: `rep-${createdAt}`,
    parentReplyId: null,
    authorType: "human",
    authorName: "张三",
    authorBotId: null,
    authorUserId: null,
    content: "已处理",
    createdAt,
    attachments: [],
    skillRefs: [],
    knowledgeRefs: [],
    mentionRefs: [],
    ...overrides,
  };
}

function post(id: string, overrides: Partial<Post> & { status: PostStatus; createdAt: string; replies?: PostReply[] }): Post {
  return {
    id,
    title: `标题 ${id}`,
    summary: "摘要",
    botId: null,
    imPlatform: "未指定",
    domain: "test",
    resolvedAt: null,
    knowledgeRefs: [],
    skillRefs: [],
    fields: {},
    timeline: [],
    replies: overrides.replies ?? [],
    reviewedAt: null,
    reviewer: null,
    authorUserId: null,
    // status / createdAt 由 overrides 类型强制提供，仅靠末尾展开即可满足 Post，无需前置赋值。
    ...overrides,
  };
}

function doc(id: string, overrides: Partial<MarkdownDoc> & { contentState: MarkdownDoc["contentState"]; updatedAt: string }): MarkdownDoc {
  return {
    id,
    title: `文档 ${id}`,
    tags: [],
    domain: "test",
    category: "经验",
    subtype: null,
    ownerBotIds: [],
    summary: "摘要",
    body: "正文",
    type: "knowledge",
    version: null,


    evidence: null,
    rejectedAt: null,
    rejector: null,
    rejectionReason: null,
    authorUserId: null,
    createdAt: null,
    ...overrides,
  } as MarkdownDoc;
}

describe("monitoringEnteredDateKey", () => {
  it("returns the earliest reply's date key", () => {
    const p = post("p", {
      status: "monitoring",
      createdAt: "2026-07-20T10:00:00+08:00",
      replies: [reply("2026-07-29T10:00:00+08:00"), reply("2026-08-04T10:00:00+08:00")],
    });
    assert.equal(monitoringEnteredDateKey(p), "2026-07-29");
  });

  it("returns empty string for a post without replies", () => {
    const p = post("p", { status: "open", createdAt: "2026-08-04T10:00:00+08:00", replies: [] });
    assert.equal(monitoringEnteredDateKey(p), "");
  });
});

describe("buildPendingReviewItems · 问题帖", () => {
  it("includes a monitoring post published earlier when its first reply lands this week", () => {
    const p = post("p1", {
      status: "monitoring",
      createdAt: "2026-07-20T10:00:00+08:00",
      replies: [reply("2026-08-04T10:00:00+08:00")],
    });
    const items = buildPendingReviewItems([p], [], WEEK);
    assert.equal(items.length, 1);
    assert.equal(items[0].kind, "post");
    assert.equal(items[0].key, "post-p1");
    // 卡片展示发布时间（上周），筛选仍按本周进入观察中。
    assert.equal(items[0].dateKey, "2026-07-20");
  });

  it("includes a monitoring post published this week with a reply this week", () => {
    const p = post("p2", {
      status: "monitoring",
      createdAt: "2026-08-04T09:00:00+08:00",
      replies: [reply("2026-08-04T10:00:00+08:00")],
    });
    const items = buildPendingReviewItems([p], [], WEEK);
    assert.equal(items.length, 1);
    assert.equal(items[0].key, "post-p2");
  });

  it("includes a reopened post whose monitoringEnteredAt lands this week even when published and first replied earlier", () => {
    // 已解决帖本周被新回复重开：monitoringEnteredAt = 本周，首条回复 / 发布时间都更早。
    const p = post("pReopen", {
      status: "monitoring",
      createdAt: "2026-07-20T10:00:00+08:00",
      replies: [reply("2026-07-29T10:00:00+08:00"), reply("2026-08-06T10:00:00+08:00")],
      monitoringEnteredAt: "2026-08-06T10:00:00+08:00",
    });
    const items = buildPendingReviewItems([p], [], WEEK);
    assert.equal(items.length, 1);
    assert.equal(items[0].key, "post-pReopen");
    // 卡片展示发布时间（2026-07-20），而非重开 / 首次回复日。
    assert.equal(items[0].dateKey, "2026-07-20");
  });

  it("excludes a reopened post whose monitoringEnteredAt predates this week", () => {
    // 上周重开、本周仍在观察中：重开不在本周 → 不纳入。
    const p = post("pReopenOld", {
      status: "monitoring",
      createdAt: "2026-07-20T10:00:00+08:00",
      replies: [reply("2026-07-29T10:00:00+08:00"), reply("2026-07-31T10:00:00+08:00")],
      monitoringEnteredAt: "2026-07-31T10:00:00+08:00",
    });
    const items = buildPendingReviewItems([p], [], WEEK);
    assert.deepEqual(items, []);
  });

  it("excludes a monitoring post whose first reply predates this week even with later activity", () => {
    // 本周的回复只是观察中状态内的活动，不是"进入观察中"；首条回复在上周 → 不纳入。
    const p = post("p3", {
      status: "monitoring",
      createdAt: "2026-07-20T10:00:00+08:00",
      replies: [reply("2026-07-29T10:00:00+08:00"), reply("2026-08-04T10:00:00+08:00")],
    });
    const items = buildPendingReviewItems([p], [], WEEK);
    assert.deepEqual(items, []);
  });

  it("falls back to the earliest reply when monitoringEnteredAt is absent (legacy data)", () => {
    // 迁移 040 前 / 种子 / JSON 回退路径无 monitoringEnteredAt：按最早回复时间判定。
    const p = post("pLegacy", {
      status: "monitoring",
      createdAt: "2026-08-01T10:00:00+08:00",
      replies: [reply("2026-08-04T10:00:00+08:00")],
    });
    const items = buildPendingReviewItems([p], [], WEEK);
    assert.equal(items.length, 1);
    // 无 monitoringEnteredAt 的旧数据：筛选回退最早回复（本周），卡片展示发布时间。
    assert.equal(items[0].dateKey, "2026-08-01");
  });

  it("excludes an open post even when created this week (not yet in review)", () => {
    const p = post("p4", { status: "open", createdAt: "2026-08-04T10:00:00+08:00", replies: [] });
    const items = buildPendingReviewItems([p], [], WEEK);
    assert.deepEqual(items, []);
  });

  it("excludes resolved posts", () => {
    const resolved = post("p5", {
      status: "resolved",
      createdAt: "2026-08-03T10:00:00+08:00",
      reviewedAt: "2026-08-05T10:00:00+08:00",
      replies: [reply("2026-08-04T10:00:00+08:00")],
    });
    const items = buildPendingReviewItems([resolved], [], WEEK);
    assert.deepEqual(items, []);
  });
});

describe("buildPendingReviewItems · 知识/技能", () => {
  it("includes a Needs Review doc updated this week", () => {
    // createdAt 缺省为 null（历史 / 本地回退路径）→ 展示回退到 updatedAt（发布时间）。
    const d = doc("d1", { contentState: "Needs Review", updatedAt: "2026-08-04" });
    const items = buildPendingReviewItems([], [d], WEEK);
    assert.equal(items.length, 1);
    assert.equal(items[0].kind, "doc");
    assert.equal(items[0].key, "doc-knowledge-d1");
    assert.equal(items[0].dateKey, "2026-08-04");
  });

  it("shows the publish date (createdAt) instead of the Needs Review date", () => {
    // 上周发布、本周修订进入待审核：筛选按本周（updatedAt），卡片展示发布时间（createdAt）。
    const d = doc("d5", { contentState: "Needs Review", updatedAt: "2026-08-04", createdAt: "2026-07-20" });
    const items = buildPendingReviewItems([], [d], WEEK);
    assert.equal(items.length, 1);
    assert.equal(items[0].key, "doc-knowledge-d5");
    assert.equal(items[0].dateKey, "2026-07-20");
  });

  it("excludes a Needs Review doc whose updatedAt predates this week", () => {
    const d = doc("d2", { contentState: "Needs Review", updatedAt: "2026-07-29" });
    const items = buildPendingReviewItems([], [d], WEEK);
    assert.deepEqual(items, []);
  });

  it("excludes Approved and Reviewing docs updated this week", () => {
    const approved = doc("d3", { contentState: "Approved", updatedAt: "2026-08-04" });
    const reviewing = doc("d4", { contentState: "Reviewing", updatedAt: "2026-08-04" });
    const items = buildPendingReviewItems([], [approved, reviewing], WEEK);
    assert.deepEqual(items, []);
  });
});

describe("buildPendingReviewItems · 排序", () => {
  it("sorts mixed posts and docs by entered-review time ascending", () => {
    const pLate = post("late", {
      status: "monitoring",
      createdAt: "2026-07-20T10:00:00+08:00",
      replies: [reply("2026-08-08T10:00:00+08:00")],
    });
    const dEarly = doc("early", { contentState: "Needs Review", updatedAt: "2026-08-03" });
    const pMid = post("mid", {
      status: "monitoring",
      createdAt: "2026-08-04T09:00:00+08:00",
      replies: [reply("2026-08-05T10:00:00+08:00")],
    });
    const items = buildPendingReviewItems([pLate, pMid], [dEarly], WEEK);
    assert.deepEqual(
      items.map((item) => item.key),
      ["doc-knowledge-early", "post-mid", "post-late"],
    );
  });
});
