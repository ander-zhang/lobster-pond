import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { contentStateFormalUse, contentStateLabel } from "../src/lib/format.ts";
import { contentStateSchema, rejectionInputSchema } from "../src/lib/services/schemas.ts";

describe("rejection backend state contracts", () => {
  it("accepts Reviewing as the rejected document state and keeps it non-formal", () => {
    assert.equal(contentStateSchema.parse("Reviewing"), "Reviewing");
    assert.equal(contentStateFormalUse("Reviewing"), "caution");
    assert.equal(contentStateLabel("Reviewing"), "复盘中");
  });

  it("知识和技能详情页只用黑色中文徽标展示复盘中", async () => {
    const [page, styles] = await Promise.all([
      readFile(new URL("../src/app/library/[type]/[id]/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
    ]);
    assert.match(page, /showRaw=\{!isApproved && !isReviewing\}/);
    assert.match(page, /isReviewing \? " state-badge-black" : ""/);
    assert.match(styles, /\.state-badge-black \{[\s\S]*background: #000;[\s\S]*color: #fff;/);
  });

  it("normalizes a rejection reason and rejects whitespace-only input", () => {
    assert.equal(rejectionInputSchema.parse({ reason: "  缺少证据  " }).reason, "缺少证据");
    assert.equal(rejectionInputSchema.safeParse({ reason: "\n\t" }).success, false);
  });
});
