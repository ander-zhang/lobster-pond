import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { docInputSchema } from "../src/lib/services/schemas.ts";

const base = {
  type: "knowledge" as const,
  title: "分类校验用例标题",
  tags: ["t1"],
  domain: "运维与部署" as const,
  ownerBotIds: [],
  summary: "至少十个字符的摘要内容示例。",
  body: "至少十个字符的正文内容示例。",
};

describe("知识 schema：category 枚举", () => {
  it("接受 6 值种别之一", () => {
    const r = docInputSchema.safeParse({ ...base, category: "标准", subtype: "编码标准" });
    assert.equal(r.success, true);
  });

  it("拒绝非枚举种别（旧自由文本）", () => {
    const r = docInputSchema.safeParse({ ...base, category: "调研笔记", subtype: "编码标准" });
    assert.equal(r.success, false);
  });
});

describe("知识 schema：subtype 级联", () => {
  it("非经验必填且须属于该种别", () => {
    assert.equal(docInputSchema.safeParse({ ...base, category: "标准", subtype: "编码标准" }).success, true);
    assert.equal(docInputSchema.safeParse({ ...base, category: "标准", subtype: "竞品调研报告" }).success, false);
    assert.equal(docInputSchema.safeParse({ ...base, category: "标准" }).success, false);
    assert.equal(docInputSchema.safeParse({ ...base, category: "标准", subtype: "" }).success, false);
  });

  it("经验：subtype 必须为空", () => {
    assert.equal(docInputSchema.safeParse({ ...base, category: "经验" }).success, true);
    assert.equal(docInputSchema.safeParse({ ...base, category: "经验", subtype: "" }).success, true);
    assert.equal(docInputSchema.safeParse({ ...base, category: "经验", subtype: "编码标准" }).success, false);
  });
});

describe("知识 schema：平台运营领域级种别/类型", () => {
  const platformOps = { ...base, domain: "平台运营" as const };

  it("体系·使用手册（平台运营专属类型）通过", () => {
    assert.equal(docInputSchema.safeParse({ ...platformOps, category: "体系", subtype: "使用手册" }).success, true);
  });

  it("体系·应急预案（默认领域类型）在平台运营被拒", () => {
    assert.equal(docInputSchema.safeParse({ ...platformOps, category: "体系", subtype: "应急预案" }).success, false);
  });

  it("白皮书无类型：省略 subtype 通过；带 subtype 被拒", () => {
    assert.equal(docInputSchema.safeParse({ ...platformOps, category: "白皮书" }).success, true);
    assert.equal(docInputSchema.safeParse({ ...platformOps, category: "白皮书", subtype: "使用手册" }).success, false);
  });

  it("默认领域种别（标准）在平台运营被拒", () => {
    assert.equal(docInputSchema.safeParse({ ...platformOps, category: "标准", subtype: "编码标准" }).success, false);
  });

  it("经验在平台运营仍合法（无类型）", () => {
    assert.equal(docInputSchema.safeParse({ ...platformOps, category: "经验" }).success, true);
  });
});
