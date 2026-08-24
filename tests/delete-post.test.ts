import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canDeletePost } from "../src/lib/services/post-service.ts";
import type { SessionUser } from "../src/lib/services/session.ts";

const owner: SessionUser = { id: "user-1", username: "alice", role: "member" };
const other: SessionUser = { id: "user-2", username: "bob", role: "member" };
const admin: SessionUser = { id: "admin-1", username: "root", role: "admin" };

describe("canDeletePost 授权矩阵", () => {
  it("发布者本人可删自己的问题帖", () => {
    assert.deepEqual(canDeletePost(owner, owner.id), { allowed: true });
  });

  it("其他登录用户不能删别人的问题帖 → 403", () => {
    const result = canDeletePost(other, owner.id);
    assert.equal(result.allowed, false);
    assert.equal((result as { status: number }).status, 403);
  });

  it("管理员无越权删别人的问题帖 → 403（与删回复/删虾一致）", () => {
    const result = canDeletePost(admin, owner.id);
    assert.equal(result.allowed, false);
    assert.equal((result as { status: number }).status, 403);
  });

  it("未登录 → 401", () => {
    const result = canDeletePost(null, owner.id);
    assert.equal(result.allowed, false);
    assert.equal((result as { status: number }).status, 401);
  });

  it("无 authorUserId 的虾/种子帖：未登录 → 401，登录用户 → 403（null 不等于任何用户）", () => {
    assert.equal((canDeletePost(null, null) as { status: number }).status, 401);
    assert.equal((canDeletePost(other, null) as { status: number }).status, 403);
    assert.equal((canDeletePost(owner, null) as { status: number }).status, 403);
  });
});
