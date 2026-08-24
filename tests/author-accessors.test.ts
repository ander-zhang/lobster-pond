import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterPostsByAuthor, filterRepliesByAuthor } from "../src/lib/content.ts";
import type { EnrichedPost, PostReply } from "../src/lib/types";

function makeReply(id: string, authorUserId: string | null, createdAt: string): PostReply {
  return {
    id,
    parentReplyId: null,
    authorType: "human",
    authorName: "u",
    authorBotId: null,
    authorUserId,
    content: `reply ${id}`,
    createdAt,
    attachments: [],
    skillRefs: [],
    knowledgeRefs: [],
    mentionRefs: [],
  };
}

function makePost(id: string, authorUserId: string | null, replies: PostReply[] = []): EnrichedPost {
  return {
    id,
    title: id,
    summary: "",
    botId: "b",
    imPlatform: "未指定",
    domain: "incident",
    status: "open",
    createdAt: "2026-07-01T00:00:00+08:00",
    resolvedAt: null,
    knowledgeRefs: [],
    skillRefs: [],
    fields: {},
    timeline: [],
    replies,
    reviewedAt: null,
    reviewer: null,
    authorUserId,
    bot: null,
    authorUsername: null,
    knowledge: [],
    skills: [],
  };
}

describe("filterPostsByAuthor", () => {
  it("只保留 authorUserId 匹配的帖子", () => {
    const posts = [
      makePost("p1", "user-1"),
      makePost("p2", "user-2"),
      makePost("p3", null),
      makePost("p4", "user-1"),
    ];
    const mine = filterPostsByAuthor(posts, "user-1");
    assert.deepEqual(
      mine.map((p) => p.id),
      ["p1", "p4"],
    );
  });
});

describe("filterRepliesByAuthor", () => {
  it("跨帖收集匹配作者的回复，按时间倒序，带所属帖", () => {
    const posts = [
      makePost("p1", "user-1", [
        makeReply("r1", "user-1", "2026-07-01T09:00:00+08:00"),
        makeReply("r2", "user-2", "2026-07-01T10:00:00+08:00"),
      ]),
      makePost("p2", null, [makeReply("r3", "user-1", "2026-07-02T08:00:00+08:00")]),
    ];
    const mine = filterRepliesByAuthor(posts, "user-1");
    assert.deepEqual(
      mine.map((item) => item.reply.id),
      ["r3", "r1"],
    );
    assert.equal(mine[0].post.id, "p2");
    assert.equal(mine[1].post.id, "p1");
  });

  it("无主回复（authorUserId=null）不匹配任何用户", () => {
    const posts = [makePost("p1", null, [makeReply("r0", null, "2026-07-01T09:00:00+08:00")])];
    assert.deepEqual(filterRepliesByAuthor(posts, "user-1"), []);
  });
});
