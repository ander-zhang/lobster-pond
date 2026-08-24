// tests/versioning.test.ts
// 文档版本约束纯函数（src/lib/versioning.ts）：格式 / 比较 / 历史归一 / 修订递增校验。
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DOC_VERSION_RE,
  parseDocVersion,
  compareDocVersions,
  normalizeLegacyVersion,
  validateVersionedUpdate,
} from "../src/lib/versioning.ts";

describe("DOC_VERSION_RE（合法格式 x.y.z，无 v 前缀）", () => {
  it("接受合法三段数字", () => {
    for (const v of ["0.0.0", "1.0.0", "2.13.4", "10.0.99"]) {
      assert.ok(DOC_VERSION_RE.test(v), `${v} 应为合法格式`);
    }
  });

  it("拒绝 v 前缀 / 不足三段 / 多余三段 / 含字母 / 空 / 前后空格", () => {
    for (const v of ["v1.0.0", "1.0", "1", "1.0.0.0", "1.0-beta", "", " 1.0.0 "]) {
      assert.ok(!DOC_VERSION_RE.test(v), `${v} 应为非法格式`);
    }
  });
});

describe("parseDocVersion", () => {
  it("合法版本解析为数值三元组", () => {
    assert.deepEqual(parseDocVersion("1.2.3"), { major: 1, minor: 2, patch: 3 });
    assert.deepEqual(parseDocVersion("0.0.0"), { major: 0, minor: 0, patch: 0 });
  });

  it("非法格式返回 null", () => {
    assert.equal(parseDocVersion("v1.0.0"), null);
    assert.equal(parseDocVersion("1.0"), null);
    assert.equal(parseDocVersion("abc"), null);
  });
});

describe("compareDocVersions（数值逐段比较）", () => {
  it("按 major→minor→patch 排序", () => {
    assert.ok(compareDocVersions("1.0.1", "1.0.0") > 0);
    assert.ok(compareDocVersions("1.1.0", "1.0.9") > 0);
    assert.ok(compareDocVersions("2.0.0", "1.99.99") > 0);
    assert.ok(compareDocVersions("1.0.0", "1.0.1") < 0);
    assert.equal(compareDocVersions("1.0.0", "1.0.0"), 0);
  });
});

describe("normalizeLegacyVersion（历史版本归一基线，不写库）", () => {
  it("空 / 无法解析 → 1.0.0", () => {
    assert.equal(normalizeLegacyVersion(null), "1.0.0");
    assert.equal(normalizeLegacyVersion(undefined), "1.0.0");
    assert.equal(normalizeLegacyVersion(""), "1.0.0");
    assert.equal(normalizeLegacyVersion("abc"), "1.0.0");
    assert.equal(normalizeLegacyVersion("1.0.0.0"), "1.0.0");
    assert.equal(normalizeLegacyVersion("1"), "1.0.0");
  });

  it("已合法 x.y.z 原样", () => {
    assert.equal(normalizeLegacyVersion("1.0.0"), "1.0.0");
    assert.equal(normalizeLegacyVersion("2.13.4"), "2.13.4");
  });

  it("v 前缀剥除", () => {
    assert.equal(normalizeLegacyVersion("v1.0.2"), "1.0.2");
  });

  it("两段补零", () => {
    assert.equal(normalizeLegacyVersion("v1.0"), "1.0.0");
    assert.equal(normalizeLegacyVersion("1.0"), "1.0.0");
    assert.equal(normalizeLegacyVersion("v1.2"), "1.2.0");
  });
});

describe("validateVersionedUpdate（修订版本校验：必填 + 格式 + 严格递增）", () => {
  it("新版本缺省拒绝", () => {
    const result = validateVersionedUpdate("1.0.0", undefined);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /填写版本号/);
  });

  it("新版本格式非法拒绝", () => {
    const result = validateVersionedUpdate("1.0.0", "v1.0.1");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /格式必须为 x\.y\.z/);
  });

  it("新版本等于旧版本拒绝", () => {
    const result = validateVersionedUpdate("1.0.0", "1.0.0");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /必须大于当前版本/);
  });

  it("新版本小于旧版本拒绝", () => {
    const result = validateVersionedUpdate("2.0.0", "1.9.9");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /必须大于当前版本/);
  });

  it("合法递增通过并返回新版本", () => {
    for (const [oldV, newV] of [
      ["1.0.0", "1.0.1"],
      ["1.0.0", "1.1.0"],
      ["1.0.0", "2.0.0"],
      ["1.0.1", "1.1.0"],
    ]) {
      const result = validateVersionedUpdate(oldV, newV);
      assert.equal(result.ok, true, `${oldV} → ${newV} 应通过`);
      if (result.ok) assert.equal(result.version, newV);
    }
  });

  it("历史旧值归一基线后比较", () => {
    // 无版本 → 基线 1.0.0，新版本 1.0.1 通过
    assert.equal(validateVersionedUpdate(null, "1.0.1").ok, true);
    // v1.0 → 基线 1.0.0，新版本 1.0.0 等于基线 → 拒绝
    assert.equal(validateVersionedUpdate("v1.0", "1.0.0").ok, false);
    // v1.2 → 基线 1.2.0，新版本 1.2.1 通过
    assert.equal(validateVersionedUpdate("v1.2", "1.2.1").ok, true);
    // v1.2 → 基线 1.2.0，新版本 1.1.0 更小 → 拒绝
    assert.equal(validateVersionedUpdate("v1.2", "1.1.0").ok, false);
  });
});
