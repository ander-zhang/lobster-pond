import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildContentVersion, deriveContentAggregate, type ContentVersionAggregate } from "../src/lib/content-version.ts";
import type { Bot, EnrichedPost, MarkdownDoc } from "../src/lib/types.ts";

const baseAggregate: ContentVersionAggregate = {
  posts: { count: 2, newestCreatedAt: "2026-08-20T01:00:00.000Z", open: 1, monitoring: 1, resolved: 0, reviewed: 0 },
  replies: { count: 1, newestCreatedAt: "2026-08-20T02:00:00.000Z" },
  docs: {
    count: 1,
    newestUpdatedAt: "2026-08-20",
    newestRevisedAt: null,
    approved: 1,
    needsReview: 0,
    needsAttention: 0,
    reviewing: 0,
    newestApprovedAt: "2026-08-19T00:00:00.000Z",
    newestRejectedAt: null,
    newestReviewTransferredAt: null,
  },
  comments: { count: 0, newestCreatedAt: null },
  bots: { count: 3 },
  downloads: { total: 4 },
};

describe("buildContentVersion", () => {
  it("相同聚合产出相同版本串", () => {
    assert.equal(buildContentVersion(baseAggregate), buildContentVersion(baseAggregate));
  });

  it("帖子数变化 → 版本变化", () => {
    const next = { ...baseAggregate, posts: { ...baseAggregate.posts, count: 3 } };
    assert.notEqual(buildContentVersion(next), buildContentVersion(baseAggregate));
  });

  it("最新帖子时间变化（同帖数）→ 版本变化", () => {
    const next = { ...baseAggregate, posts: { ...baseAggregate.posts, newestCreatedAt: "2026-08-20T05:00:00.000Z" } };
    assert.notEqual(buildContentVersion(next), buildContentVersion(baseAggregate));
  });

  it("回复数变化 → 版本变化", () => {
    const next = { ...baseAggregate, replies: { ...baseAggregate.replies, count: 2 } };
    assert.notEqual(buildContentVersion(next), buildContentVersion(baseAggregate));
  });

  it("文档状态分布变化（审批通过 Needs Review → Approved）→ 版本变化", () => {
    const next = {
      ...baseAggregate,
      docs: { ...baseAggregate.docs, approved: 2, needsReview: -1 },
    };
    assert.notEqual(buildContentVersion(next), buildContentVersion(baseAggregate));
  });

  it("评论数变化 → 版本变化", () => {
    const next = { ...baseAggregate, comments: { count: 1, newestCreatedAt: "2026-08-20T06:00:00.000Z" } };
    assert.notEqual(buildContentVersion(next), buildContentVersion(baseAggregate));
  });

  it("虾数变化 → 版本变化", () => {
    const next = { ...baseAggregate, bots: { count: 4 } };
    assert.notEqual(buildContentVersion(next), buildContentVersion(baseAggregate));
  });

  it("下载总数变化 → 版本变化", () => {
    const next = { ...baseAggregate, downloads: { total: 5 } };
    assert.notEqual(buildContentVersion(next), buildContentVersion(baseAggregate));
  });

  it("同日修订：updated_at 不变、revised_at 变 → 版本必变", () => {
    // docs.updated_at 只存 YYYY-MM-DD，同日修订必须靠 revised_at 分辨（spec 关键坑）。
    const next = { ...baseAggregate, docs: { ...baseAggregate.docs, newestRevisedAt: "2026-08-20T08:30:00.000Z" } };
    assert.notEqual(buildContentVersion(next), buildContentVersion(baseAggregate));
  });

  it("转审：状态分布不变、review_transferred_at 变 → 版本必变", () => {
    // 转审不改 content_state / updated_at，必须靠 review_transferred_at 分辨，
    // 否则转审后两端的详情页（按钮显隐）不会实时刷新。
    const next = { ...baseAggregate, docs: { ...baseAggregate.docs, newestReviewTransferredAt: "2026-08-20T09:00:00.000Z" } };
    assert.notEqual(buildContentVersion(next), buildContentVersion(baseAggregate));
  });

  it("已审帖数变化 → 版本变化", () => {
    const next = { ...baseAggregate, posts: { ...baseAggregate.posts, reviewed: 1 } };
    assert.notEqual(buildContentVersion(next), buildContentVersion(baseAggregate));
  });
});

// --- 读取层派生（无 DB 回退路径）-------------------------------------------

const bot: Bot = {
  id: "bot-a",
  name: "Bot A",
  role: "岗位虾",
  master: "",
  ownerUserId: null,
  summary: "",
  domains: [],
  version: "",
  model: "",
  createdAt: null,
};

function makeReply(id: string, createdAt: string): EnrichedPost["replies"][number] {
  return {
    id,
    parentReplyId: null,
    authorType: "human",
    authorName: "张三",
    authorBotId: null,
    authorUserId: "user-1",
    content: "回复内容",
    createdAt,
    attachments: [],
    skillRefs: [],
    knowledgeRefs: [],
    mentionRefs: [],
  };
}

function makePost(id: string, status: "open" | "monitoring" | "resolved", createdAt: string, replies: EnrichedPost["replies"]): EnrichedPost {
  return {
    id,
    title: `帖子 ${id}`,
    summary: "",
    botId: "bot-a",
    imPlatform: "im",
    domain: "policy",
    status,
    createdAt,
    resolvedAt: null,
    knowledgeRefs: [],
    skillRefs: [],
    fields: {},
    timeline: [],
    replies,
    reviewedAt: null,
    reviewer: null,
    authorUserId: null,
    bot,
    authorUsername: null,
    knowledge: [],
    skills: [],
  };
}

function makeDoc(id: string, updatedAt: string, contentState: MarkdownDoc["contentState"], revisedAt: string | null): MarkdownDoc {
  return {
    id,
    type: "knowledge",
    title: `文档 ${id}`,
    tags: [],
    updatedAt,
    revisedAt,
    ownerBotIds: [],
    summary: "",
    body: "",
    contentState,
    version: null,
    authorUserId: null,
    evidence: null,
    domain: "平台运营",
    category: "经验",
    subtype: null,
  };
}

describe("deriveContentAggregate", () => {
  it("从读取层数据派生聚合：计数 / 最新时间 / 状态分布正确", () => {
    const posts = [
      makePost("p1", "open", "2026-08-19T01:00:00.000Z", [makeReply("r1", "2026-08-19T02:00:00.000Z")]),
      makePost("p2", "resolved", "2026-08-20T03:00:00.000Z", []),
    ];
    const docs = [
      makeDoc("d1", "2026-08-19", "Approved", null),
      makeDoc("d2", "2026-08-20", "Needs Review", "2026-08-20T08:30:00.000Z"),
    ];
    const agg = deriveContentAggregate(posts, docs, [bot]);
    assert.equal(agg.posts.count, 2);
    assert.equal(agg.posts.open, 1);
    assert.equal(agg.posts.resolved, 1);
    assert.equal(agg.posts.monitoring, 0);
    assert.equal(agg.posts.newestCreatedAt, "2026-08-20T03:00:00.000Z");
    assert.equal(agg.replies.count, 1);
    assert.equal(agg.replies.newestCreatedAt, "2026-08-19T02:00:00.000Z");
    assert.equal(agg.docs.count, 2);
    assert.equal(agg.docs.approved, 1);
    assert.equal(agg.docs.needsReview, 1);
    assert.equal(agg.docs.newestUpdatedAt, "2026-08-20");
    assert.equal(agg.docs.newestRevisedAt, "2026-08-20T08:30:00.000Z");
    assert.equal(agg.bots.count, 1);
  });

  it("无 DB 回退粒度：评论与下载恒为零值", () => {
    const agg = deriveContentAggregate([], [], []);
    assert.equal(agg.comments.count, 0);
    assert.equal(agg.comments.newestCreatedAt, null);
    assert.equal(agg.downloads.total, 0);
  });

  it("空数据 → null 时间字段，签名仍可构造", () => {
    const agg = deriveContentAggregate([], [], []);
    assert.equal(agg.posts.newestCreatedAt, null);
    assert.ok(buildContentVersion(agg).includes("p0|none"));
  });
});

describe("getContentVersion（无 DB 回退路径冒烟）", () => {
  it("返回非空版本串，且无变化时稳定", async () => {
    // 测试环境不设 DATABASE_URL 时走读取层回退；设了就跳过（DB 路径由 QA 覆盖）。
    if (process.env.DATABASE_URL) return;
    const { getContentVersion } = await import("../src/lib/content-version.ts");
    const first = await getContentVersion();
    const second = await getContentVersion();
    assert.ok(typeof first === "string" && first.length > 0);
    assert.equal(first, second);
  });
});
