import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { derivePostStatus } from "../src/lib/post-replies.ts";
import type { PostReply } from "../src/lib/types.ts";

function reply(overrides: Partial<PostReply> = {}): PostReply {
  return {
    id: "rep-1",
    parentReplyId: null,
    authorType: "human",
    authorName: "张三",
    authorBotId: null,
    authorUserId: null,
    content: "已处理",
    createdAt: "2026-07-07T00:00:00.000Z",
    attachments: [],
    skillRefs: [],
    knowledgeRefs: [],
    mentionRefs: [],
    ...overrides,
  };
}

describe("derivePostStatus", () => {
  it("no replies → open (未处理)", () => {
    assert.equal(derivePostStatus([], null, "open"), "open");
  });

  it("replies but not reviewed → monitoring (观察中)", () => {
    assert.equal(derivePostStatus([reply()], null, "open"), "monitoring");
  });

  it("replies and reviewed → resolved (已解决)", () => {
    assert.equal(derivePostStatus([reply()], "2026-07-07T01:00:00.000Z", "open"), "resolved");
  });

  it("falls back to legacy status when there are no replies (backward compat)", () => {
    assert.equal(derivePostStatus([], null, "resolved"), "resolved");
    assert.equal(derivePostStatus([], null, "monitoring"), "monitoring");
  });

  it("ignores reviewedAt when there are no replies (review requires replies in service)", () => {
    assert.equal(derivePostStatus([], "2026-07-07T01:00:00.000Z", "open"), "open");
  });
});
