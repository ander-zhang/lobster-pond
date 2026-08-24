import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { enrichPost, postReferencesDoc } from "../src/lib/content.ts";
import type { EnrichedPost, MarkdownDoc, Post } from "../src/lib/types.ts";

const baseSkill: MarkdownDoc = {
  id: "triage",
  title: "故障分诊",
  tags: [],
  scenario: "编程开发",
  updatedAt: "2026-06-09",
  ownerBotIds: [],
  summary: "",
  body: "",
  type: "skills",
  contentState: "Approved",
  version: null,


  evidence: null,
  authorUserId: null,
};

const replySkill: MarkdownDoc = { ...baseSkill, id: "rag-search", title: "RAG 检索" };
const otherSkill: MarkdownDoc = { ...baseSkill, id: "unrelated", title: "无关技能" };

function basePost(overrides: Partial<Post> = {}): Post {
  return {
    id: "pkt-1",
    title: "重复升级",
    summary: "",
    botId: null,
    imPlatform: "Slack",
    domain: "incident",
    status: "resolved",
    createdAt: "2026-06-09T09:20:00+08:00",
    resolvedAt: "2026-06-09T10:05:00+08:00",
    knowledgeRefs: [],
    skillRefs: [],
    fields: {},
    timeline: [],
    replies: [],
    reviewedAt: "2026-06-09T10:05:00+08:00",
    reviewer: "alice",
    authorUserId: null,
    ...overrides,
  };
}

describe("enrichPost evidence skills", () => {
  it("merges reply-referenced skills into post.skills (deduped, post-level first)", () => {
    const post = basePost({
      skillRefs: ["triage"],
      replies: [
        {
          id: "r1",
          parentReplyId: null,
          authorType: "human",
          authorName: "alice",
          authorBotId: null,
          authorUserId: "u1",
          content: "试试 rag-search",
          createdAt: "2026-06-09T09:40:00+08:00",
          attachments: [],
          skillRefs: [{ id: "rag-search", title: "RAG 检索" }],
          knowledgeRefs: [],
          mentionRefs: [],
        },
      ],
    });

    const enriched = enrichPost(post, [], [], [baseSkill, replySkill, otherSkill], new Map());

    // 帖级技能在前，回复引用的技能在后，未引用的不出现。
    assert.deepEqual(
      enriched.skills.map((d) => d.id),
      ["triage", "rag-search"],
    );
  });

  it("does not duplicate a skill referenced by both post and reply", () => {
    const post = basePost({
      skillRefs: ["triage"],
      replies: [
        {
          id: "r1",
          parentReplyId: null,
          authorType: "human",
          authorName: "alice",
          authorBotId: null,
          authorUserId: "u1",
          content: "",
          createdAt: "2026-06-09T09:40:00+08:00",
          attachments: [],
          skillRefs: [{ id: "triage", title: "故障分诊" }],
          knowledgeRefs: [],
          mentionRefs: [],
        },
      ],
    });

    const enriched = enrichPost(post, [], [], [baseSkill], new Map());
    assert.deepEqual(
      enriched.skills.map((d) => d.id),
      ["triage"],
    );
  });

  it("dedupes the same skill across multiple replies", () => {
    const post = basePost({
      replies: [
        {
          id: "r1",
          parentReplyId: null,
          authorType: "human",
          authorName: "alice",
          authorBotId: null,
          authorUserId: "u1",
          content: "",
          createdAt: "2026-06-09T09:40:00+08:00",
          attachments: [],
          skillRefs: [{ id: "rag-search", title: "RAG 检索" }],
          knowledgeRefs: [],
          mentionRefs: [],
        },
        {
          id: "r2",
          parentReplyId: null,
          authorType: "human",
          authorName: "bob",
          authorBotId: null,
          authorUserId: "u2",
          content: "",
          createdAt: "2026-06-09T09:42:00+08:00",
          attachments: [],
          skillRefs: [{ id: "rag-search", title: "RAG 检索" }],
          knowledgeRefs: [],
          mentionRefs: [],
        },
      ],
    });

    const enriched = enrichPost(post, [], [], [replySkill], new Map());
    assert.deepEqual(
      enriched.skills.map((d) => d.id),
      ["rag-search"],
    );
  });
});

describe("postReferencesDoc", () => {
  it("matches a post-level skill ref", () => {
    const post = enrichPost(basePost({ skillRefs: ["triage"] }), [], [], [baseSkill], new Map());
    assert.equal(postReferencesDoc(post as EnrichedPost, "triage"), true);
  });

  it("matches a post-level knowledge ref", () => {
    const post = enrichPost(basePost({ knowledgeRefs: ["routing"] }), [], [], [], new Map());
    assert.equal(postReferencesDoc(post as EnrichedPost, "routing"), true);
  });

  it("matches a reply-referenced skill", () => {
    const post = enrichPost(
      basePost({
        replies: [
          {
            id: "r1",
            parentReplyId: null,
            authorType: "human",
            authorName: "alice",
            authorBotId: null,
            authorUserId: "u1",
            content: "",
            createdAt: "2026-06-09T09:40:00+08:00",
            attachments: [],
            skillRefs: [{ id: "rag-search", title: "RAG 检索" }],
            knowledgeRefs: [],
            mentionRefs: [],
          },
        ],
      }),
      [],
      [],
      [replySkill],
      new Map(),
    );
    assert.equal(postReferencesDoc(post as EnrichedPost, "rag-search"), true);
  });

  it("does not match an unrelated doc", () => {
    const post = enrichPost(
      basePost({
        skillRefs: ["triage"],
        replies: [
          {
            id: "r1",
            parentReplyId: null,
            authorType: "human",
            authorName: "alice",
            authorBotId: null,
            authorUserId: "u1",
            content: "",
            createdAt: "2026-06-09T09:40:00+08:00",
            attachments: [],
            skillRefs: [{ id: "rag-search", title: "RAG 检索" }],
            knowledgeRefs: [],
            mentionRefs: [],
          },
        ],
      }),
      [],
      [],
      [baseSkill, replySkill],
      new Map(),
    );
    assert.equal(postReferencesDoc(post as EnrichedPost, "unrelated"), false);
  });
});
