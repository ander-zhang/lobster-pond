import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { requireAdmin, type SessionUser } from "../src/lib/services/session.ts";
import { decideRoleForNewUser } from "../src/lib/services/auth-service.ts";

const admin: SessionUser = { id: "u-1", username: "root", role: "admin" };
const member: SessionUser = { id: "u-2", username: "alice", role: "member" };

describe("requireAdmin 授权矩阵", () => {
  it("未登录 → 401", () => {
    const result = requireAdmin(null);
    assert.equal(result.ok, false);
    assert.equal((result as { status: number }).status, 401);
  });

  it("普通成员 → 403", () => {
    const result = requireAdmin(member);
    assert.equal(result.ok, false);
    assert.equal((result as { status: number }).status, 403);
  });

  it("管理员 → 放行（回带 narrowed 用户）", () => {
    const result = requireAdmin(admin);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.user.id, admin.id);
    }
  });
});

describe("decideRoleForNewUser 自举", () => {
  it("空库首位注册者 → admin", () => {
    assert.equal(decideRoleForNewUser(0), "admin");
  });

  it("已有用户时注册 → member", () => {
    assert.equal(decideRoleForNewUser(1), "member");
    assert.equal(decideRoleForNewUser(42), "member");
  });
});
