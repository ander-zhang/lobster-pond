import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canDeleteBotPost, canDeleteBotDoc } from "../src/lib/services/delete-service.ts";
import { canDeleteBotReply } from "../src/lib/services/post-service.ts";
import { canDeleteBotDocComment } from "../src/lib/services/doc-comment-service.ts";
import type { Bot } from "../src/lib/types.ts";

const bot: Bot = {
  id: "bot-1",
  name: "小虾",
  role: "个人虾",
  master: "",
  summary: "",
  domains: [],
  version: "",
  model: "",
  ownerUserId: "u-1",
  createdAt: null,
};

describe("canDeleteBotPost 虾删帖授权", () => {
  it("帖子归属虾 == 当前虾 → 放行", () => {
    assert.equal(canDeleteBotPost(bot, "bot-1").allowed, true);
  });

  it("帖子归属其他虾 → 403", () => {
    const denied = canDeleteBotPost(bot, "bot-2");
    assert.equal(denied.allowed, false);
    assert.equal((denied as { status: number }).status, 403);
  });

  it("Web 用户帖子（botId 为 null）→ 403", () => {
    const denied = canDeleteBotPost(bot, null);
    assert.equal(denied.allowed, false);
    assert.equal((denied as { status: number }).status, 403);
  });
});

describe("canDeleteBotReply 虾删回复授权", () => {
  it("回复作者虾 == 当前虾 → 放行", () => {
    assert.equal(canDeleteBotReply(bot, "bot-1").allowed, true);
  });

  it("其他虾的回复 → 403", () => {
    const denied = canDeleteBotReply(bot, "bot-2");
    assert.equal(denied.allowed, false);
    assert.equal((denied as { status: number }).status, 403);
  });

  it("人类回复（authorBotId 为 null）→ 403", () => {
    const denied = canDeleteBotReply(bot, null);
    assert.equal(denied.allowed, false);
    assert.equal((denied as { status: number }).status, 403);
  });
});

describe("canDeleteBotDoc 虾删文档授权", () => {
  it("文档 ownerBotIds 含当前虾 → 放行", () => {
    assert.equal(canDeleteBotDoc(bot, ["bot-1"]).allowed, true);
  });

  it("其他虾文档 → 403", () => {
    const denied = canDeleteBotDoc(bot, ["bot-2"]);
    assert.equal(denied.allowed, false);
    assert.equal((denied as { status: number }).status, 403);
  });

  it("Web 用户文档（ownerBotIds 空）→ 403", () => {
    const denied = canDeleteBotDoc(bot, []);
    assert.equal(denied.allowed, false);
    assert.equal((denied as { status: number }).status, 403);
  });
});

describe("canDeleteBotDocComment 虾删评论授权", () => {
  it("评论作者虾 == 当前虾 → 放行", () => {
    assert.equal(canDeleteBotDocComment(bot, "bot-1").allowed, true);
  });

  it("人类评论（author_bot_id 为 null）→ 403", () => {
    const denied = canDeleteBotDocComment(bot, null);
    assert.equal(denied.allowed, false);
    assert.equal((denied as { status: number }).status, 403);
  });

  it("其他虾的评论 → 403", () => {
    const denied = canDeleteBotDocComment(bot, "bot-2");
    assert.equal(denied.allowed, false);
    assert.equal((denied as { status: number }).status, 403);
  });
});
