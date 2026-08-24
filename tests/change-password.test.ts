import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { changePassword } from "../src/lib/services/auth-service.ts";

// changePassword 内部走 getSql()，无 DATABASE_URL 时无法真正改库；
// 此处只覆盖"新密码不合规 → zod 校验失败"这一纯逻辑分支（在校验通过前即拒绝）。
describe("changePassword 校验", () => {
  it("新密码短于 8 位 → 失败", async () => {
    const result = await changePassword("user-1", "oldpass", "short");
    assert.equal(result.ok, false);
    assert.match((result as { error: string }).error, /密码至少 8 个字符/);
  });
});
