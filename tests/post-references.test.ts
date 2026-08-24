import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validatePostReferences } from "../src/lib/services/post-service.ts";
import type { MarkdownDoc } from "../src/lib/types.ts";

// 构造最小 MarkdownDoc fixture，只填校验关心的字段。
function doc(id: string, type: "knowledge" | "skills", contentState: MarkdownDoc["contentState"]): MarkdownDoc {
  const common = {
    id,
    title: id,
    tags: [],
    updatedAt: "2026-07-16",
    ownerBotIds: [],
    summary: "",
    body: "",
    contentState,
    version: null,
    evidence: null,
    authorUserId: null,
  };
  if (type === "skills") {
    return { ...common, type: "skills", scenario: "编程开发" };
  }
  return { ...common, type: "knowledge", domain: "test", category: "经验", subtype: null };
}

describe("validatePostReferences", () => {
  it("已批准知识 / 已批准技能可被引用", () => {
    const docs = [doc("k-app", "knowledge", "Approved"), doc("s-app", "skills", "Approved")];
    assert.equal(validatePostReferences(["k-app"], ["s-app"], docs).ok, true);
  });

  it("待审核（Needs Review）知识不可被引用", () => {
    const docs = [doc("k-review", "knowledge", "Needs Review")];
    const result = validatePostReferences(["k-review"], [], docs);
    assert.equal(result.ok, false);
    assert.ok(result.ok === false && result.error.includes("k-review"));
    assert.ok(result.ok === false && result.error.includes("尚未正式发布"));
  });

  it("待留意（Needs Attention）知识不可被引用", () => {
    const docs = [doc("k-attention", "knowledge", "Needs Attention")];
    const result = validatePostReferences(["k-attention"], [], docs);
    assert.equal(result.ok, false);
    assert.ok(result.ok === false && result.error.includes("尚未正式发布"));
  });

  it("知识 ID 不能当作技能引用（类型不符视为未知）", () => {
    const docs = [doc("k-app", "knowledge", "Approved")];
    const result = validatePostReferences([], ["k-app"], docs);
    assert.equal(result.ok, false);
    assert.ok(result.ok === false && result.error.includes("unknown skillRefs"));
    assert.ok(result.ok === false && result.error.includes("k-app"));
  });

  it("未知 ID 报 unknown，且优先于非正式状态报错", () => {
    const docs = [doc("k-review", "knowledge", "Needs Review")];
    const result = validatePostReferences(["missing", "k-review"], [], docs);
    assert.equal(result.ok, false);
    // 未知 ID 优先报
    assert.ok(result.ok === false && result.error.includes("unknown knowledgeRefs"));
    assert.ok(result.ok === false && result.error.includes("missing"));
  });

  it("空引用通过", () => {
    assert.equal(validatePostReferences([], [], []).ok, true);
  });
});
