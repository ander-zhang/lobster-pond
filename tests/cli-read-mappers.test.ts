// tests/cli-read-mappers.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  toPostListItem,
  toPostDetailItem,
  toDocListItem,
  toDocDetailItem,
  toDocCommentItem,
} from "../src/lib/cli-read-mappers.ts";
import type { EnrichedPost, PostReply, MarkdownDoc, DocComment, Bot } from "../src/lib/types.ts";

const bot: Bot = { id: "bot-a", name: "虾A", role: "个人虾", master: "", ownerUserId: "u1", summary: "", domains: [], version: "v1", model: "deepseek", createdAt: null };

function post(overrides: Partial<EnrichedPost> = {}): EnrichedPost {
  return {
    id: "p1", title: "测试帖", summary: "摘要", botId: "bot-a", imPlatform: "Slack",
    domain: "incident", status: "resolved", createdAt: "2026-08-01T00:00:00.000Z",
    resolvedAt: "2026-08-01T01:00:00.000Z",
    knowledgeRefs: ["k1"], skillRefs: ["s1"],
    fields: { sourceChannel: "#a" }, timeline: [],
    replies: [], reviewedAt: null, reviewer: null,
    authorUserId: null, bot: bot, authorUsername: null, knowledge: [], skills: [],
    ...overrides,
  };
}

function reply(overrides: Partial<PostReply> = {}): PostReply {
  return {
    id: "r1", parentReplyId: null, authorType: "bot", authorName: "虾A",
    authorBotId: "bot-a", authorUserId: null, content: "回复", createdAt: "2026-08-01T00:30:00.000Z",
    attachments: [{ id: "a1", filename: "f.txt", contentType: "text/plain", sizeBytes: 10, uploadedAt: "x" }],
    skillRefs: [{ id: "s1", title: "技能" }], knowledgeRefs: [{ id: "k1", title: "知识" }],
    mentionRefs: [], ...overrides,
  };
}

function doc(overrides: Partial<MarkdownDoc> = {}): MarkdownDoc {
  return {
    id: "d1", title: "知识", tags: ["t"], domain: "incident", category: "经验", subtype: null, updatedAt: "2026-08-01",
    createdAt: "2026-08-01T00:00:00.000Z", ownerBotIds: ["bot-a"], summary: "摘要", body: "正文",
    type: "knowledge", contentState: "Approved", version: "v1",
    evidence: null, authorUserId: null,
    ...overrides,
  } as MarkdownDoc;
}

function comment(overrides: Partial<DocComment> = {}): DocComment {
  return {
    id: "c1", docId: "d1", parentCommentId: null, authorType: "bot",
    authorUserId: "u1", authorBotId: "bot-a", authorUsername: "虾A",
    content: "评论", createdAt: "2026-08-01T00:00:00.000Z", mentionRefs: [],
    ...overrides,
  };
}

const botsById = new Map([[bot.id, bot] as const]);
const authorNames = new Map<string, string>();

describe("CLI 只读返回裁剪", () => {
  it("toPostListItem 裁剪字段并带虾名署名", () => {
    const item = toPostListItem(post());
    assert.deepEqual(item, {
      id: "p1", title: "测试帖", summary: "摘要", domain: "incident",
      status: "resolved", createdAt: "2026-08-01T08:00:00.000+08:00",
      authorName: "虾A", knowledgeRefs: ["k1"], skillRefs: ["s1"],
    });
    // 不泄露审计字段
    assert.ok(!("reviewer" in item));
    assert.ok(!("replies" in item));
  });

  it("toPostListItem 无人虾帖子回退作者用户名", () => {
    const item = toPostListItem(post({ botId: null, bot: null, authorUserId: "u1", authorUsername: "alice" }));
    assert.equal(item.authorName, "alice");
  });

  it("toPostDetailItem 带 fields / timeline / 裁剪后的 replies（附件仅元信息）", () => {
    const item = toPostDetailItem(post({ replies: [reply()] }));
    assert.equal(item.fields.sourceChannel, "#a");
    assert.deepEqual(item.replies, [{
      id: "r1", authorName: "虾A", authorType: "bot", content: "回复",
      createdAt: "2026-08-01T08:30:00.000+08:00",
      knowledgeRefs: [{ id: "k1", title: "知识" }], skillRefs: [{ id: "s1", title: "技能" }],
      attachments: [{ filename: "f.txt", contentType: "text/plain", sizeBytes: 10 }],
    }]);
    // 附件不含 base64
    assert.ok(!("contentBase64" in item.replies[0].attachments[0]));
  });

  it("toDocListItem 仅 Approved 并带虾名署名", () => {
    const item = toDocListItem(doc(), botsById, authorNames);
    assert.equal(item.contentState, "Approved");
    assert.equal(item.authorName, "虾A");
    assert.ok(!("body" in item)); // 列表不含正文
  });

  it("toDocListItem 无人虾文档回退未署名", () => {
    const item = toDocListItem(doc({ ownerBotIds: [], authorUserId: null }), botsById, authorNames);
    assert.equal(item.authorName, "未署名");
  });

  it("toDocDetailItem 带正文与完整元信息", () => {
    const item = toDocDetailItem(doc({ tags: ["t"], evidence: "来源" }), botsById, authorNames);
    assert.equal(item.body, "正文");
    assert.deepEqual(item.tags, ["t"]);
    assert.equal(item.evidence, "来源");
  });

  it("toDocCommentItem 带署名与艾特", () => {
    const item = toDocCommentItem(comment({ mentionRefs: [{ targetType: "bot", targetId: "bot-b", name: "虾B" }] }));
    assert.deepEqual(item, {
      id: "c1", authorName: "虾A", authorType: "bot", content: "评论",
      createdAt: "2026-08-01T08:00:00.000+08:00", parentCommentId: null,
      mentionRefs: [{ targetType: "bot", targetId: "bot-b", name: "虾B" }],
    });
  });
});
