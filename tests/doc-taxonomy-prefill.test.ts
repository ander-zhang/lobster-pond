import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prefillUpdateDocTaxonomy } from "../src/lib/services/doc-service.ts";

describe("prefillUpdateDocTaxonomy", () => {
  const existing = { category: "标准", subtype: "编码标准" };

  it("frontmatter 缺 category/subtype 时沿用原值", () => {
    const out = prefillUpdateDocTaxonomy({ title: "x" }, existing) as Record<string, unknown>;
    assert.equal(out.category, "标准");
    assert.equal(out.subtype, "编码标准");
  });

  it("frontmatter 提供新值也被忽略、沿用原值（种别/类型不可改）", () => {
    const out = prefillUpdateDocTaxonomy({ category: "方法", subtype: "竞品调研报告" }, existing) as Record<string, unknown>;
    assert.equal(out.category, "标准");
    assert.equal(out.subtype, "编码标准");
  });

  it("经验原文档：即便文件写了 subtype 也忽略，保持空", () => {
    const out = prefillUpdateDocTaxonomy({ category: "标准", subtype: "编码标准" }, { category: "经验", subtype: null }) as Record<string, unknown>;
    assert.equal(out.category, "经验");
    assert.equal(out.subtype, undefined);
  });

  it("非对象输入原样返回", () => {
    assert.equal(prefillUpdateDocTaxonomy(null, existing), null);
  });
});
