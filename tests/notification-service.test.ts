import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { docCommentNotificationRecipient, replyNotificationRecipient } from "../src/lib/services/notification-service.ts";

describe("replyNotificationRecipient", () => {
  it("notifies the human post author about another user's reply", () => {
    assert.equal(replyNotificationRecipient("user-owner", null, "user-replier"), "user-owner");
  });

  it("does not notify a user about their own reply", () => {
    assert.equal(replyNotificationRecipient("user-owner", null, "user-owner"), null);
  });

  it("notifies the bot owner when their bot's post receives a reply", () => {
    assert.equal(replyNotificationRecipient(null, "user-bot-owner", "user-replier"), "user-bot-owner");
  });

  it("does not notify the bot owner about their own human reply", () => {
    assert.equal(replyNotificationRecipient(null, "user-bot-owner", "user-bot-owner"), null);
  });

  it("treats another user's bot reply as external and skips ownerless posts", () => {
    assert.equal(replyNotificationRecipient("user-owner", null, null, "other-owner"), "user-owner");
    assert.equal(replyNotificationRecipient(null, null, "user-replier"), null);
  });

  it("does not notify an owner when their own bot replies", () => {
    assert.equal(replyNotificationRecipient("user-owner", null, null, "user-owner"), null);
    assert.equal(replyNotificationRecipient(null, "user-owner", null, "user-owner"), null);
  });

  it("prefers the post author when both ownership paths exist", () => {
    assert.equal(replyNotificationRecipient("user-author", "user-bot-owner", "user-replier"), "user-author");
  });
});

describe("docCommentNotificationRecipient", () => {
  it("notifies a document author about another user's comment", () => {
    assert.equal(docCommentNotificationRecipient("author", "commenter"), "author");
  });

  it("does not notify authors about their own comments or ownerless documents", () => {
    assert.equal(docCommentNotificationRecipient("author", "author"), null);
    assert.equal(docCommentNotificationRecipient(null, "commenter"), null);
  });
});

describe("虾帖回复通知投递到虾", () => {
  it("虾发布的问题帖收到回复时通知虾本身而非虾的 owner", () => {
    const path = new URL("../src/lib/services/post-service.ts", import.meta.url);
    const source = fs.readFileSync(path, "utf8");
    // 虾帖（botId 非空）：recipientUserId 置空，不写 owner 网页提醒。
    assert.match(source, /const isBotPost = post\.botId !== null/);
    assert.match(source, /const recipientUserId = isBotPost\s*\? null\s*: replyNotificationRecipient/);
    // 虾帖改写 bot_notifications（reply 类型），且回复者若是虾本人则跳过。
    assert.match(source, /insertBotReplyNotification\(\{/);
    assert.match(source, /post\.botId !== null && replyBot\?\.id !== post\.botId/);
  });
});

describe("虾被艾特通知虾本身", () => {
  it("回复中艾特虾：虾收到 bot mention 通知，owner 不再收网页提醒", () => {
    const path = new URL("../src/lib/services/post-service.ts", import.meta.url);
    const source = fs.readFileSync(path, "utf8");
    // 收集被艾特的虾 botId，并从网页提醒排除其 owner。
    assert.match(source, /const mentionedBotIds = new Set/);
    assert.match(source, /mentionedBotIds\.delete|mentionRecipients\.delete\(mentionedBot\.ownerUserId\)/);
    // 事务内对被艾特虾写 bot_notifications(mention)。
    assert.match(source, /insertBotMentionNotification\(\{/);
    assert.match(source, /你在问题帖「/);
  });

  it("文档评论中艾特虾：虾收到 bot mention 通知，owner 不再收网页提醒", () => {
    const path = new URL("../src/lib/services/doc-comment-service.ts", import.meta.url);
    const source = fs.readFileSync(path, "utf8");
    // 艾特虾时 recipientUserId 置 null（owner 不进网页提醒），并收集被艾特虾。
    assert.match(source, /mentionedBotIds = new Set/);
    assert.match(source, /recipientUserId: null/);
    // 事务内对被艾特虾写 bot_notifications(mention)。
    assert.match(source, /insertBotMentionNotification\(\{/);
    assert.match(source, /你在文档「/);
  });
});
