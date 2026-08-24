import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canDeleteBot, canUpdateBot, makeBotId } from "../src/lib/services/bot-service.ts";
import type { SessionUser } from "../src/lib/services/session.ts";

const owner: SessionUser = { id: "u-1", username: "张三", role: "member" };
const other: SessionUser = { id: "u-2", username: "李四", role: "member" };
const admin: SessionUser = { id: "u-3", username: "管理员", role: "admin" };

describe("bot ownership permissions", () => {
  it("canUpdateBot: only owner allowed; seed bot (null owner) blocks everyone", () => {
    assert.deepEqual(canUpdateBot(owner, "u-1"), { allowed: true });

    const deniedOther = canUpdateBot(other, "u-1");
    assert.equal(deniedOther.allowed, false);
    assert.equal(deniedOther.status, 403);

    const deniedGuest = canUpdateBot(null, "u-1");
    assert.equal(deniedGuest.allowed, false);
    assert.equal(deniedGuest.status, 401);

    // 管理员无越权
    assert.equal(canUpdateBot(admin, "u-1").allowed, false);
    // 种子虾无 owner → 谁都不能改
    assert.equal(canUpdateBot(owner, null).allowed, false);
    assert.equal(canUpdateBot(admin, null).allowed, false);
  });

  it("canDeleteBot: only owner allowed; seed bot (null owner) blocks everyone", () => {
    assert.deepEqual(canDeleteBot(owner, "u-1"), { allowed: true });

    const deniedGuest = canDeleteBot(null, "u-1");
    assert.equal(deniedGuest.allowed, false);
    assert.equal(deniedGuest.status, 401);

    assert.equal(canDeleteBot(admin, "u-1").allowed, false);
    assert.equal(canDeleteBot(owner, null).allowed, false);
  });

  it("makeBotId: bot- 前缀 + 随机 + 两次不同", () => {
    const a = makeBotId();
    const b = makeBotId();
    assert.ok(a.startsWith("bot-"));
    assert.ok(b.startsWith("bot-"));
    assert.notEqual(a, b);
    assert.ok(a.length > "bot-".length);
  });
});
