import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectPromotableKnowledge } from "../src/lib/services/post-service.ts";
import type { MarkdownDoc } from "../src/lib/types.ts";

function doc(id: string, contentState: MarkdownDoc["contentState"]): MarkdownDoc {
  return {
    id, title: id, tags: [], domain: "test", category: "经验", subtype: null, updatedAt: "2026-07-19",
    ownerBotIds: [], summary: "", body: "", type: "knowledge",
    contentState, version: null,
evidence: null, authorUserId: null,
  };
}

describe("selectPromotableKnowledge", () => {
  it("仅保留当前 Approved 的 knowledge，去重", () => {
    const docs = [doc("k-app", "Approved"), doc("k-rev", "Needs Review")];
    const ids = ["k-app", "k-rev", "k-app", "ghost"];
    assert.deepEqual(selectPromotableKnowledge(ids, docs), ["k-app"]);
  });

  it("空入参返回空", () => {
    assert.deepEqual(selectPromotableKnowledge([], [doc("k-app", "Approved")]), []);
  });

  it("Needs Review 不提升", () => {
    const docs = [doc("k-rev", "Needs Review")];
    assert.deepEqual(selectPromotableKnowledge(["k-rev"], docs), []);
  });
});
