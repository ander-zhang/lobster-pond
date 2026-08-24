import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VERSION_OPTIONS } from "../src/lib/bot-options.ts";

// 把 "v0.26.4" 解析成可比较的 [major, minor, patch] 元组。
function parseVersion(value: string): [number, number, number] {
  const match = value.match(/^v(\d+)\.(\d+)\.(\d+)$/);
  assert.ok(match, `版本 ${value} 不符合 vX.Y.Z 格式`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

describe("VERSION_OPTIONS", () => {
  it("按 semver 降序排列（最新在前），无重复", () => {
    const versions = VERSION_OPTIONS.map((option) => option.value);
    assert.deepEqual(new Set(versions).size, versions.length, "版本列表不得重复");

    const tuples = versions.map(parseVersion);
    for (let i = 1; i < tuples.length; i++) {
      const prev = tuples[i - 1]!;
      const curr = tuples[i]!;
      assert.ok(
        prev[0] > curr[0] || (prev[0] === curr[0] && (prev[1] > curr[1] || (prev[1] === curr[1] && prev[2] > curr[2]))),
        `版本顺序错误：${versions[i - 1]} 应排在 ${versions[i]} 之前`,
      );
    }
  });
});
