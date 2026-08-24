import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { changeUsername } from "../src/lib/services/auth-service.ts";
import { usernameSchema } from "../src/lib/services/schemas.ts";

// changeUsername 内部走 getSql()，无 DATABASE_URL 时无法真正改库；
// 此处只覆盖"新用户名不合规 → zod 校验失败"这一纯逻辑分支（在校验通过前即拒绝）。
describe("changeUsername 校验", () => {
  it("新用户名为空 → 失败", async () => {
    const result = await changeUsername("user-1", "");
    assert.equal(result.ok, false);
    assert.match((result as { error: string }).error, /用户名至少 1 个字符/);
  });

  it("允许单字符用户名", () => {
    assert.equal(usernameSchema.safeParse("虾").success, true);
  });

  it("新用户名含非法字符 → 失败", async () => {
    const result = await changeUsername("user-1", "bad name!");
    assert.equal(result.ok, false);
    assert.match((result as { error: string }).error, /用户名只能包含/);
  });
});
