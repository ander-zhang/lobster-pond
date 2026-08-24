import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeStats } from "../src/lib/content.ts";
import type { Bot, ContentState, MarkdownDoc, Post, PostStatus } from "../src/lib/types.ts";

function post(id: string, status: PostStatus): Post {
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
    replies: [],
    reviewedAt: null,
    reviewer: null,
    authorUserId: null,
    createdAt: "2026-08-11T00:00:00+08:00",
    status,
  };
}

function doc(id: string, type: MarkdownDoc["type"], contentState: ContentState): MarkdownDoc {
  const common = {
    id,
    title: `文档 ${id}`,
    tags: [],
    updatedAt: "2026-08-11",
    ownerBotIds: [],
    summary: "摘要",
    body: "正文",
    contentState,
    version: null,
    evidence: null,
    rejectedAt: null,
    rejector: null,
    rejectionReason: null,
    authorUserId: null,
    createdAt: null,
  };
  if (type === "skills") {
    return { ...common, type: "skills", scenario: "编程开发" };
  }
  return { ...common, type: "knowledge", domain: "test", category: "经验", subtype: null };
}

function bot(id: string): Bot {
  return {
    id,
    name: `虾 ${id}`,
    role: "个人虾",
    master: "",
    ownerUserId: null,
    summary: "",
    domains: [],
    version: "",
    model: "",
    createdAt: null,
  };
}

describe("computeStats", () => {
  it("只计 Approved 的知识/技能，未批准不计入", () => {
    const stats = computeStats(
      [post("p1", "resolved")],
      [
        doc("a", "knowledge", "Approved"),
        doc("b", "skills", "Approved"),
        doc("c", "knowledge", "Needs Review"),
        doc("d", "knowledge", "Needs Attention"),
        doc("e", "skills", "Reviewing"),
      ],
      [bot("b1")],
    );
    assert.deepEqual(stats, { posts: 1, bots: 1, knowledge: 1, skills: 1, resolved: 1 });
  });

  it("无 Approved 文档时 knowledge/skills 为 0", () => {
    const stats = computeStats([], [
      doc("x", "knowledge", "Needs Review"),
      doc("y", "skills", "Reviewing"),
    ], []);
    assert.deepEqual(stats, { posts: 0, bots: 0, knowledge: 0, skills: 0, resolved: 0 });
  });

  it("posts/resolved 不过滤状态（全状态计）", () => {
    const stats = computeStats(
      [post("p1", "open"), post("p2", "monitoring"), post("p3", "open"), post("p4", "resolved")],
      [],
      [],
    );
    assert.deepEqual(stats, { posts: 4, bots: 0, knowledge: 0, skills: 0, resolved: 1 });
  });
});
