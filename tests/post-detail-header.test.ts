import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const pageSource = fs.readFileSync(path.join(process.cwd(), "src", "app", "posts", "[id]", "page.tsx"), "utf8");

// "Above the title" = the header card (the soft-grid block) up to the title h1.
// Scope the chip assertions to this region so unrelated uses of post fields
// elsewhere on the page (e.g. the sidebar delete control's postId={post.id})
// don't produce false positives.
const headerStart = pageSource.indexOf("soft-grid");
const titleIndex = pageSource.indexOf("{post.title}", headerStart);
const headerRegion = headerStart >= 0 && titleIndex >= 0 ? pageSource.slice(headerStart, titleIndex) : pageSource;

describe("post detail header", () => {
  it("does not render internal id or IM source chips above the title", () => {
    assert.ok(headerStart >= 0 && titleIndex >= 0, "could not locate the post detail header region");
    assert.equal(headerRegion.includes("{post.id}"), false);
    assert.equal(headerRegion.includes("{post.imPlatform}"), false);
  });
});
