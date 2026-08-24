import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canCreateDocComment, canDeleteDocComment } from "../src/lib/services/doc-comment-service.ts";
import { docCommentInputSchema } from "../src/lib/services/schemas.ts";
import type { SessionUser } from "../src/lib/services/session.ts";

const user: SessionUser = { id: "user-1", username: "alice", role: "member" };
const other: SessionUser = { id: "user-2", username: "bob", role: "member" };
const admin: SessionUser = { id: "admin-1", username: "admin", role: "admin" };

describe("文档评论", () => {
  it("仅登录用户可以发表评论", () => {
    assert.deepEqual(canCreateDocComment(user), { allowed: true });
    const denied = canCreateDocComment(null);
    assert.equal(denied.allowed, false);
    assert.equal((denied as { status: number }).status, 401);
  });

  it("评论内容必须为去除空白后的非空文本，且不超过长度限制", () => {
    const parsed = docCommentInputSchema.parse({ content: "  有帮助  " });
    assert.equal(parsed.content, "有帮助");
    assert.equal(parsed.parentCommentId, undefined);
    assert.deepEqual(parsed.mentionRefs, []);
    assert.equal(docCommentInputSchema.safeParse({ content: " \n " }).success, false);
    assert.equal(docCommentInputSchema.safeParse({ content: "x".repeat(2001) }).success, false);
  });

  it("接受非空父评论 ID，并拒绝空白 ID", () => {
    const parsed = docCommentInputSchema.parse({ content: "回复", parentCommentId: "comment-1" });
    assert.equal(parsed.parentCommentId, "comment-1");
    assert.equal(docCommentInputSchema.safeParse({ content: "回复", parentCommentId: "  " }).success, false);
  });

  it("接受最多 20 个用户或虾艾特，并拒绝非法对象", () => {
    const valid = docCommentInputSchema.safeParse({
      content: "@alice 请看",
      mentionRefs: [{ targetType: "user", targetId: "untrusted", name: "alice" }, { targetType: "bot", targetId: "bot-1", name: "小虾" }],
    });
    assert.equal(valid.success, true);
    assert.equal(docCommentInputSchema.safeParse({ content: "x", mentionRefs: Array.from({ length: 21 }, (_, index) => ({ targetType: "user", targetId: `u-${index}`, name: `u${index}` })) }).success, false);
    assert.equal(docCommentInputSchema.safeParse({ content: "x", mentionRefs: [{ targetType: "group", targetId: "g", name: "g" }] }).success, false);
  });

  it("评论发布者本人可以删除自己的评论", () => {
    assert.deepEqual(canDeleteDocComment(user, user.id), { allowed: true });
  });

  it("其他登录用户和管理员不能删除别人的评论", () => {
    for (const currentUser of [other, admin]) {
      const denied = canDeleteDocComment(currentUser, user.id);
      assert.equal(denied.allowed, false);
      assert.equal((denied as { status: number }).status, 403);
    }
  });

  it("未登录用户不能删除评论", () => {
    const denied = canDeleteDocComment(null, user.id);
    assert.equal(denied.allowed, false);
    assert.equal((denied as { status: number }).status, 401);
  });

  it("虾评论（authorBotId 非空）不可由人删除，包括虾的 owner → 403", () => {
    for (const currentUser of [user, other, admin]) {
      const denied = canDeleteDocComment(currentUser, currentUser.id, "bot-1");
      assert.equal(denied.allowed, false);
      assert.equal((denied as { status: number }).status, 403);
    }
  });
});
