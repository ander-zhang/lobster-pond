import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterPosts, getPostListVersion } from "../src/lib/post-list-state.ts";
import type { EnrichedPost } from "../src/lib/types.ts";

const basePost: EnrichedPost = {
  id: "pkt-base",
  title: "Base packet",
  summary: "Base summary",
  botId: "bot-a",
  imPlatform: "im",
  domain: "policy",
  status: "open",
  createdAt: "2026-06-14T01:00:00.000Z",
  resolvedAt: null,
  knowledgeRefs: [],
  skillRefs: [],
  fields: {},
  timeline: [],
  replies: [],
  reviewedAt: null,
  reviewer: null,
  authorUserId: null,
  bot: {
    id: "bot-a",
    name: "Bot A",
    role: "岗位虾",
    master: "",
    summary: "Handles policy",
    domains: ["policy"],
    ownerUserId: null,
    version: "",
    model: "",
    createdAt: null,
  },
  authorUsername: null,
  knowledge: [],
  skills: [],
};

function post(overrides: Partial<EnrichedPost>): EnrichedPost {
  return { ...basePost, ...overrides };
}

describe("post list state", () => {
  it("filters posts by domain, bot, status, and search query", () => {
    const posts = [
      post({ id: "pkt-a", title: "Policy exception", domain: "policy", botId: "bot-a", status: "open" }),
      post({ id: "pkt-b", title: "Battery incident", domain: "data-algorithms", botId: "bot-b", status: "monitoring" }),
      post({ id: "pkt-c", title: "Policy resolved", domain: "policy", botId: "bot-a", status: "resolved" }),
    ];

    const filtered = filterPosts(posts, {
      domain: "policy",
      botId: "bot-a",
      status: "open",
      query: "exception",
    });

    assert.deepEqual(filtered.map((item) => item.id), ["pkt-a"]);
  });

  it("filters posts by author username (locates content by its publisher)", () => {
    const posts = [
      post({ id: "pkt-u1", authorUserId: "u1", authorUsername: "alice", botId: null, bot: null }),
      post({ id: "pkt-u2", authorUserId: "u2", authorUsername: "bob", botId: null, bot: null }),
      post({ id: "pkt-bot", authorUserId: null, authorUsername: null }),
    ];

    const byUser = filterPosts(posts, {
      domain: "all",
      botId: "all",
      status: "all",
      query: "alice",
    });
    assert.deepEqual(byUser.map((item) => item.id), ["pkt-u1"]);

    // 历史无主帖（authorUsername 为 null）不应被用户名子串误匹配。
    const none = filterPosts(posts, {
      domain: "all",
      botId: "all",
      status: "all",
      query: "null",
    });
    assert.deepEqual(none.map((item) => item.id), []);
  });

  it("filters posts by date range (inclusive, platform timezone)", () => {
    const posts = [
      post({ id: "pkt-1", createdAt: "2026-06-14T01:00:00.000Z" }),
      post({ id: "pkt-2", createdAt: "2026-06-15T01:00:00.000Z" }),
      post({ id: "pkt-3", createdAt: "2026-06-16T01:00:00.000Z" }),
    ];

    const filtered = filterPosts(posts, {
      domain: "all",
      botId: "all",
      status: "all",
      query: "",
      dateFrom: "2026-06-15",
      dateTo: "2026-06-16",
    });

    assert.deepEqual(filtered.map((item) => item.id), ["pkt-2", "pkt-3"]);
  });

  it("changes the version when a newer post arrives", () => {
    const previous = getPostListVersion([
      post({ id: "pkt-a", createdAt: "2026-06-14T01:00:00.000Z" }),
    ]);
    const next = getPostListVersion([
      post({ id: "pkt-b", createdAt: "2026-06-14T02:00:00.000Z" }),
      post({ id: "pkt-a", createdAt: "2026-06-14T01:00:00.000Z" }),
    ]);

    assert.notEqual(next, previous);
    assert.equal(next, "2:2026-06-14T02:00:00.000Z:pkt-b:r0:none:v0");
  });
});
