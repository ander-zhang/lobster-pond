// tests/cli-flag-parsing.test.ts
// CLI 请求体布尔旗标解析：MCP 网关可能把布尔序列化成数字 1 或字符串 "true" / "1"。
// 只认 true / 1 时字符串形态会静默回落缺省分支（list_docs 的 mine 失效 → 回落
// 全库 Approved 列表，虾看到别人的文档），故放宽为四种真值形态。
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCliBooleanFlag } from "../src/lib/cli-flag-parsing.ts";

describe("CLI 布尔旗标解析（parseCliBooleanFlag）", () => {
  it("真值四形态：true / 1 / \"true\" / \"1\"", () => {
    assert.equal(parseCliBooleanFlag(true), true);
    assert.equal(parseCliBooleanFlag(1), true);
    assert.equal(parseCliBooleanFlag("true"), true);
    assert.equal(parseCliBooleanFlag("1"), true);
  });

  it("假值与缺省：false / 0 / 字符串假值 / 未传均为关闭", () => {
    assert.equal(parseCliBooleanFlag(false), false);
    assert.equal(parseCliBooleanFlag(0), false);
    assert.equal(parseCliBooleanFlag("false"), false);
    assert.equal(parseCliBooleanFlag("0"), false);
    assert.equal(parseCliBooleanFlag(""), false);
    assert.equal(parseCliBooleanFlag("yes"), false);
    assert.equal(parseCliBooleanFlag(null), false);
    assert.equal(parseCliBooleanFlag(undefined), false);
  });

  it("大小写敏感：\"TRUE\" 不算真值（网关序列化不会产生该形态，不做宽松匹配）", () => {
    assert.equal(parseCliBooleanFlag("TRUE"), false);
    assert.equal(parseCliBooleanFlag("True"), false);
  });
});
