import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupReplyRefsByType, postReferencesDoc } from "../src/lib/content.ts";
import type { ReplyRefRow } from "../src/lib/content.ts";
import type { EnrichedPost, MarkdownDoc, PostReply } from "../src/lib/types.ts";

function doc(id: string, type: "knowledge" | "skills"): MarkdownDoc {
  const common = {
    id, title: id, tags: [], updatedAt: "2026-07-19",
    ownerBotIds: [], summary: "", body: "",
    contentState: "Approved" as const, version: null,
    evidence: null, authorUserId: null,
  };
  if (type === "skills") {
    return { ...common, type: "skills", scenario: "编程开发" };
  }
  return { ...common, type: "knowledge", domain: "test", category: "经验", subtype: null };
}

describe("groupReplyRefsByType", () => {
  it("按 doc_type 拆 skills / knowledge 两组", () => {
    const rows: ReplyRefRow[] = [
      { reply_id: "r1", doc_id: "k-1", doc_type: "knowledge" },
      { reply_id: "r1", doc_id: "s-1", doc_type: "skills" },
      { reply_id: "r2", doc_id: "k-2", doc_type: "knowledge" },
    ];
    const map = groupReplyRefsByType(rows, [doc("k-1", "knowledge"), doc("k-2", "knowledge"), doc("s-1", "skills")]);
    assert.deepEqual(map.get("r1")?.skills.map((s) => s.id), ["s-1"]);
    assert.deepEqual(map.get("r1")?.knowledge.map((k) => k.id), ["k-1"]);
    assert.deepEqual(map.get("r2")?.knowledge.map((k) => k.id), ["k-2"]);
    assert.equal(map.get("r2")?.skills.length, 0);
  });

  it("title 取自 docs，未知 doc 回退为 id", () => {
    const rows: ReplyRefRow[] = [{ reply_id: "r1", doc_id: "ghost", doc_type: "knowledge" }];
    const map = groupReplyRefsByType(rows, []);
    assert.equal(map.get("r1")?.knowledge[0].title, "ghost");
  });

  it("空入参返回空 Map", () => {
    assert.equal(groupReplyRefsByType([], []).size, 0);
  });
});

function makeReply(overrides: Partial<PostReply> = {}): PostReply {
  return {
    id: "r1", parentReplyId: null, authorType: "human", authorName: "x", authorBotId: null, authorUserId: null,
    content: "", createdAt: "2026-07-19T00:00:00.000Z", attachments: [],
    skillRefs: [], knowledgeRefs: [], mentionRefs: [], ...overrides,
  };
}

function makePost(replies: PostReply[], status: EnrichedPost["status"] = "monitoring"): EnrichedPost {
  return {
    id: "pkt-1", title: "t", summary: "s", botId: null, imPlatform: "未指定", domain: "d",
    status, createdAt: "2026-07-19T00:00:00.000Z", resolvedAt: status === "resolved" ? "2026-07-20T00:00:00.000Z" : null,
    knowledgeRefs: [], skillRefs: [], fields: {}, timeline: [],
    replies, reviewedAt: null, reviewer: null, authorUserId: null,
    bot: null, authorUsername: null, knowledge: [], skills: [],
  };
}

describe("postReferencesDoc 纳入回复 knowledge 引用", () => {
  it("回复引用了该 knowledge，只有已解决帖子才命中", () => {
    const reply = makeReply({ knowledgeRefs: [{ id: "k-1", title: "k-1" }] });
    assert.equal(postReferencesDoc(makePost([reply]), "k-1"), false);
    assert.equal(postReferencesDoc(makePost([reply], "resolved"), "k-1"), true);
  });

  it("未引用 → 不命中", () => {
    const post = makePost([makeReply({ knowledgeRefs: [{ id: "k-1", title: "k-1" }] })]);
    assert.equal(postReferencesDoc(post, "k-2"), false);
  });

  it("回复 skill 引用只有已解决帖子才命中", () => {
    const reply = makeReply({ skillRefs: [{ id: "s-1", title: "s-1" }] });
    assert.equal(postReferencesDoc(makePost([reply]), "s-1"), false);
    assert.equal(postReferencesDoc(makePost([reply], "resolved"), "s-1"), true);
  });
});
