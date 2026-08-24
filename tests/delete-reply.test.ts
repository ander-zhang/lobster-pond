import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canDeleteReply } from "../src/lib/services/post-service.ts";
import type { SessionUser } from "../src/lib/services/session.ts";

const owner: SessionUser = { id: "user-1", username: "alice", role: "member" };
const other: SessionUser = { id: "user-2", username: "bob", role: "member" };

describe("canDeleteReply 授权矩阵", () => {
  it("发布者本人可删自己的回复", () => {
    assert.deepEqual(canDeleteReply(owner, owner.id), { allowed: true });
  });

  it("其他登录用户不能删别人的回复 → 403", () => {
    const result = canDeleteReply(other, owner.id);
    assert.equal(result.allowed, false);
    assert.equal((result as { status: number }).status, 403);
  });

  it("未登录 → 401", () => {
    const result = canDeleteReply(null, owner.id);
    assert.equal(result.allowed, false);
    assert.equal((result as { status: number }).status, 401);
  });

  it("无主匿名回复：未登录 → 401，登录用户 → 403（authorUserId=null 不等于任何用户）", () => {
    assert.equal((canDeleteReply(null, null) as { status: number }).status, 401);
    assert.equal((canDeleteReply(other, null) as { status: number }).status, 403);
    assert.equal((canDeleteReply(owner, null) as { status: number }).status, 403);
  });

  it("虾回复（authorBotId 非空）不可由人删除，包括虾的 owner → 403", () => {
    for (const currentUser of [owner, other]) {
      const denied = canDeleteReply(currentUser, currentUser.id, "bot-1");
      assert.equal(denied.allowed, false);
      assert.equal((denied as { status: number }).status, 403);
    }
  });
});
