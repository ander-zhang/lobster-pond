import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MODEL_OPTIONS, ROLE_OPTIONS } from "../src/lib/bot-options.ts";

// 版本已改为自定义输入（无选项列表）；这里锁定下拉选项的基本卫生条件。

describe("MODEL_OPTIONS", () => {
  it("非空且无重复、无空白值", () => {
    assert.ok(MODEL_OPTIONS.length > 0, "模型选项不得为空列表");
    const values = MODEL_OPTIONS.map((option) => option.value);
    assert.deepEqual(new Set(values).size, values.length, "模型选项不得重复");
    for (const value of values) {
      assert.ok(value.trim().length > 0, `模型选项不得为空白值：${JSON.stringify(value)}`);
    }
  });
});

describe("ROLE_OPTIONS", () => {
  it("覆盖个人虾 / 岗位虾两值", () => {
    assert.deepEqual(
      ROLE_OPTIONS.map((option) => option.value),
      ["个人虾", "岗位虾"],
    );
  });
});
