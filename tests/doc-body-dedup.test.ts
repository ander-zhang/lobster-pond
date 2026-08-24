import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findDuplicateDocBody } from "../src/lib/services/doc-service.ts";

describe("findDuplicateDocBody", () => {
  it("正文与已有文档 trim 后相同则命中", () => {
    const hit = findDuplicateDocBody("正文内容", [{ body: "  正文内容  ", title: "已有知识" }]);
    assert.deepEqual(hit, { title: "已有知识" });
  });

  it("无冲突返回 null", () => {
    assert.equal(findDuplicateDocBody("新内容", [{ body: "其他内容", title: "x" }]), null);
  });

  it("跨知识 / 技能类型比对（不区分 type，只比正文）", () => {
    const docs = [{ body: "同一份正文", title: "技能A" }];
    const hit = findDuplicateDocBody("同一份正文", docs);
    assert.deepEqual(hit, { title: "技能A" });
  });

  it("仅首尾空白差异视为相同", () => {
    const hit = findDuplicateDocBody("\n正文\n", [{ body: "正文", title: "T" }]);
    assert.deepEqual(hit, { title: "T" });
  });

  it("空白正文不查重", () => {
    assert.equal(findDuplicateDocBody("   ", [{ body: "", title: "x" }]), null);
  });

  it("id 不同但正文相同仍命中（换 id 重传同一份内容）", () => {
    const docs = [{ body: "完全一样的正文", title: "旧版本" }];
    assert.deepEqual(findDuplicateDocBody("完全一样的正文", docs), { title: "旧版本" });
  });

  it("更新时排除当前文档，但仍检查其他文档", () => {
    const docs = [
      { id: "current", body: "当前正文", title: "当前文档" },
      { id: "other", body: "其他正文", title: "其他文档" },
    ];
    assert.equal(findDuplicateDocBody("当前正文", docs, "current"), null);
    assert.deepEqual(findDuplicateDocBody("其他正文", docs, "current"), { title: "其他文档" });
  });
});
