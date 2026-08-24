import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findDuplicatePostTitle } from "../src/lib/services/post-service.ts";

describe("findDuplicatePostTitle", () => {
  it("标题与已有帖 trim 后相同则命中", () => {
    const hit = findDuplicatePostTitle("重复标题", [{ title: "  重复标题  " }]);
    assert.deepEqual(hit, { title: "  重复标题  " });
  });

  it("无冲突返回 null", () => {
    assert.equal(findDuplicatePostTitle("新标题", [{ title: "其他标题" }]), null);
  });

  it("仅首尾空白差异视为相同", () => {
    const hit = findDuplicatePostTitle("\t带空白的标题\n", [{ title: "带空白的标题" }]);
    assert.deepEqual(hit, { title: "带空白的标题" });
  });

  it("空白标题不查重（避免空标题互相误判）", () => {
    assert.equal(findDuplicatePostTitle("   ", [{ title: "" }]), null);
  });

  it("大小写 / 标点不同不视为相同（精确比对）", () => {
    assert.equal(findDuplicatePostTitle("Title", [{ title: "title" }]), null);
  });
});
